import { createHash } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { StockOperation } from "../models/StockOperation.js";
import { normalize } from "./ingredients.js";
import { convert, stockUnit } from "./units.js";
import type { StockInput } from "../domain/pantry.js";

export class StockConflict extends Error { status = 409; }
export function canonicalStock(item: StockInput): StockInput {
  const name = normalize(item.name);
  if (!name) throw new StockConflict("Enter a valid ingredient name.");
  const unit = stockUnit(item.unit);
  const quantity = convert(item.quantity, item.unit, unit);
  if (!unit || quantity === null || !Number.isFinite(quantity) || quantity <= 0) throw new StockConflict("Enter a positive quantity and a valid unit.");
  return { ...item, name, unit, quantity, expiryDate: item.expiryDate ? new Date(item.expiryDate) : null };
}
export function stockFingerprint(items: StockInput[]) {
  return createHash("sha256").update(JSON.stringify(items.map(canonicalStock).map(({ name, quantity, unit, category, expiryDate, source }) => ({ name, quantity, unit, category, expiryDate, source })))).digest("hex");
}

/** Stock changes and their operation receipt commit together. No stock tombstones. */
export async function addStockInSession(userId: string, key: string, items: StockInput[], session: ClientSession) {
  const normalized = items.map(canonicalStock);
  const fingerprint = stockFingerprint(items);
  const previous = await StockOperation.findOne({ userId, key }).session(session);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new StockConflict("This save was already used for a different purchase.");
    return previous.batches;
  }
  const batches = [];
  for (const item of normalized) {
    const batchId = new Types.ObjectId();
    const ingredient = await PantryIngredient.findOneAndUpdate({ userId, key: item.name }, {
      $setOnInsert: { userId, key: item.name, name: item.name, category: item.category },
      $push: { batches: { _id: batchId, quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate, source: item.source } },
    }, { upsert: true, returnDocument: "after", runValidators: true, session });
    batches.push({ ingredientId: ingredient._id, batchId });
  }
  await StockOperation.create([{ userId, key, fingerprint, items: normalized, batches }], { session });
  return batches;
}

export async function addStock(userId: string, key: string, items: StockInput[]) {
  // Unique ingredient/operation insert races may abort a transaction. Restart from
  // its beginning so the next snapshot sees the committed ingredient/receipt.
  for (let attempt = 0; ; attempt++) {
    try { return await mongoose.connection.transaction((session) => addStockInSession(userId, key, items, session)); }
    catch (error) { if ((error as { code?: number }).code !== 11000 || attempt >= 2) throw error; }
  }
}
