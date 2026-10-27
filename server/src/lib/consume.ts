import type { Conn } from "../db/client.js";
import { newId } from "../db/ids.js";
import { pantryRepo } from "../repos/pantry.js";
import { userRepo } from "../repos/users.js";
import type { Consumed } from "../repos/food-history.js";
import type { IngredientStock } from "../domain/pantry.js";
import { isStaple, sameIngredient } from "./ingredients.js";
import { convert } from "./units.js";
import { readPantry } from "./pantry.js";
import type { StockItem } from "./stock.js";

export type { Consumed };
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
/** Takes the ingredients from the pantry. Must run inside a transaction. */
export async function consumeIngredients(userId: string, ingredients: StockItem[], tx: Conn, confirm = false) {
  await userRepo.lock(userId, tx);
  const plan = planConsumption(await readPantry(userId, tx), ingredients);
  if (plan.shortages.length && !confirm) throw new PantryShortage(plan.shortages);
  const touched = new Set(plan.deductions.map((deduction) => deduction.ingredientKey));
  for (const ingredient of plan.remaining.filter((item) => touched.has(item.key))) await pantryRepo.saveRemaining(tx, ingredient);
  return plan.deductions;
}

/** Undo restores domain history, including exhausted batches, in the meal transaction. */
export async function restoreIngredients(userId: string, consumed: Consumed[], tx: Conn) {
  await userRepo.lock(userId, tx);
  for (const item of consumed) {
    const ingredient = await pantryRepo.findByKey(userId, item.ingredientKey, tx);
    const batch = ingredient?.batches.find((batch) => batch._id === item.batchId);
    if (ingredient && batch) {
      await pantryRepo.setBatchQuantity(tx, ingredient._id, batch._id, precise(batch.quantity + item.amount));
      continue;
    }
    // Recreate the used-up batch with its original id (unless that id now belongs to a batch elsewhere).
    const restored = { _id: (await pantryRepo.batchExists(tx, item.batchId)) ? newId() : item.batchId, quantity: item.amount, unit: item.unit, expiryDate: item.expiryDate, source: item.source };
    if (ingredient) await pantryRepo.addBatch(tx, ingredient._id, restored);
    else await pantryRepo.create(tx, { userId, key: item.ingredientKey, name: item.name, category: item.category, batches: [restored] });
  }
}
