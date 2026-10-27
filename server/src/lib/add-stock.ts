import { createHash } from "node:crypto";
import type { Conn } from "../db/client.js";
import { transaction } from "../db/tx.js";
import { pantryRepo, stockOperationRepo } from "../repos/pantry.js";
import { userRepo } from "../repos/users.js";
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

/** Stock changes and their operation receipt commit together. Must run inside a transaction. */
export async function addStockInSession(userId: string, key: string, items: StockInput[], tx: Conn) {
  const normalized = items.map(canonicalStock);
  const fingerprint = stockFingerprint(items);
  // Serialize stock changes per user: concurrent requests wait here for each other.
  await userRepo.lock(userId, tx);
  const previous = await stockOperationRepo.find(userId, key, tx);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new StockConflict("This save was already used for a different purchase.");
    return previous.batches;
  }
  const batches = [];
  for (const item of normalized) {
    const ingredientId = await pantryRepo.ensureIngredient(tx, { userId, key: item.name, name: item.name, category: item.category });
    const batchId = await pantryRepo.addBatch(tx, ingredientId, { quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate, source: item.source });
    batches.push({ ingredientId, batchId });
  }
  await stockOperationRepo.create(tx, { userId, key, fingerprint, items: normalized, batches });
  return batches;
}

export async function addStock(userId: string, key: string, items: StockInput[]) {
  // A duplicate-key race (two requests creating the same receipt) is retried from the
  // start, so the second attempt sees the committed receipt and returns it.
  return transaction((tx) => addStockInSession(userId, key, items, tx), { retryDuplicates: true });
}
