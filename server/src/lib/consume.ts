import type { ClientSession, Types } from "mongoose";
import { PantryIngredient } from "../models/PantryIngredient.js";
import type { IngredientStock, PantryCategory, StockSource } from "../domain/pantry.js";
import { isStaple, sameIngredient } from "./ingredients.js";
import { convert } from "./units.js";
import { readPantry } from "./pantry.js";
import type { StockItem } from "./stock.js";

export interface Consumed {
  ingredientKey: string; batchId: Types.ObjectId; name: string; category: PantryCategory;
  amount: number; unit: string; expiryDate: Date | null; source: StockSource;
}
export interface Shortage {
  name: string; quantity: number; unit: string; have: number; shortage: number; unitMismatch: boolean; incompatibleStock: StockItem[];
}
const precise = (value: number) => Number(value.toPrecision(12));

/** Pure deduction plan: batches remain attached to their ingredient identity. */
export function planConsumption(pantry: IngredientStock[], ingredients: StockItem[]) {
  const remaining = pantry.map((ingredient) => ({ ...ingredient, batches: ingredient.batches.map((batch) => ({ ...batch })) }));
  const stock = remaining.flatMap((ingredient) => ingredient.batches.map((batch) => ({ ingredient, batch })))
    .sort((a, b) => (a.batch.expiryDate?.getTime() ?? Infinity) - (b.batch.expiryDate?.getTime() ?? Infinity));
  const deductions: Consumed[] = [];
  const shortages: Shortage[] = [];
  for (const ingredient of ingredients) {
    if (isStaple(ingredient.name)) continue;
    let needed = ingredient.quantity;
    const matches = stock.filter((row) => sameIngredient(row.ingredient.key, ingredient.name) && row.batch.quantity > 0);
    const incompatibleStock = matches.filter((row) => convert(row.batch.quantity, row.batch.unit, ingredient.unit) === null).map((row) => ({ name: row.ingredient.name, quantity: row.batch.quantity, unit: row.batch.unit }));
    const unitMismatch = incompatibleStock.length > 0;
    for (const { ingredient: owner, batch } of matches) {
      if (needed <= 1e-6) break;
      const available = convert(batch.quantity, batch.unit, ingredient.unit);
      if (available === null) continue;
      const take = Math.min(needed, available);
      const amount = convert(take, ingredient.unit, batch.unit)!;
      batch.quantity = precise(batch.quantity - amount);
      needed -= take;
      deductions.push({ ingredientKey: owner.key, batchId: batch._id, name: owner.name, category: owner.category,
        amount: precise(amount), unit: batch.unit, expiryDate: batch.expiryDate, source: batch.source });
    }
    if (needed > 1e-6) shortages.push({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit,
      have: precise(ingredient.quantity - needed), shortage: precise(needed), unitMismatch, incompatibleStock });
  }
  return { deductions, shortages, remaining: remaining.map((ingredient) => ({ ...ingredient, batches: ingredient.batches.filter((batch) => batch.quantity > 1e-6) })) };
}

export class PantryShortage extends Error {
  constructor(public shortages: Shortage[]) { super("Not enough in your pantry"); }
}
export async function consumeIngredients(userId: string, ingredients: StockItem[], session: ClientSession, confirm = false) {
  const plan = planConsumption(await readPantry(userId, session), ingredients);
  if (plan.shortages.length && !confirm) throw new PantryShortage(plan.shortages);
  const touched = new Set(plan.deductions.map((deduction) => deduction.ingredientKey));
  for (const ingredient of plan.remaining.filter((item) => touched.has(item.key))) {
    if (ingredient.batches.length) await PantryIngredient.updateOne({ _id: ingredient._id, userId }, { $set: { batches: ingredient.batches } }, { session, runValidators: true });
    else await PantryIngredient.deleteOne({ _id: ingredient._id, userId }, { session });
  }
  return plan.deductions;
}

/** Undo restores domain history, including exhausted batches, in the meal transaction. */
export async function restoreIngredients(userId: string, consumed: Consumed[], session: ClientSession) {
  for (const item of consumed) {
    const ingredient = await PantryIngredient.findOne({ userId, key: item.ingredientKey }).session(session);
    if (!ingredient) {
      await PantryIngredient.create([{ userId, key: item.ingredientKey, name: item.name, category: item.category,
        batches: [{ _id: item.batchId, quantity: item.amount, unit: item.unit, expiryDate: item.expiryDate, source: item.source }] }], { session });
    } else {
      const batch = ingredient.batches.find((batch) => String(batch._id) === String(item.batchId));
      if (batch) batch.quantity = precise(batch.quantity + item.amount);
      else ingredient.batches.push({ _id: item.batchId, quantity: item.amount, unit: item.unit, expiryDate: item.expiryDate, source: item.source });
      await ingredient.save({ session });
    }
  }
}
