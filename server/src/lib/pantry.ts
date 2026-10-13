import { PantryIngredient } from "../models/PantryIngredient.js";
import type { IngredientStock } from "../domain/pantry.js";
import type { ClientSession } from "mongoose";

export function presentIngredient(ingredient: IngredientStock) {
  const totals = new Map<string, number>();
  const batches = [...ingredient.batches].sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity));
  for (const batch of batches) totals.set(batch.unit, (totals.get(batch.unit) ?? 0) + batch.quantity);
  return { ...ingredient, batches, totals: [...totals].map(([unit, quantity]) => ({ unit, quantity })), expiryDate: batches.find((batch) => batch.expiryDate)?.expiryDate ?? null };
}
export function flattenStock(ingredients: IngredientStock[]) {
  return ingredients.flatMap((ingredient) => ingredient.batches.map((batch) => ({ name: ingredient.name, quantity: batch.quantity, unit: batch.unit })));
}
export async function readPantry(userId: string, session?: ClientSession) {
  return PantryIngredient.find({ userId }).session(session ?? null).sort({ name: 1 }).lean();
}
export async function pantryStock(userId: string, session?: ClientSession) {
  return flattenStock(await readPantry(userId, session));
}
