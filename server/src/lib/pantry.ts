import { pantryRepo } from "../repos/pantry.js";
import type { IngredientStock } from "../domain/pantry.js";
import type { Conn } from "../db/client.js";

export function presentIngredient(ingredient: IngredientStock) {
  const totals = new Map<string, number>();
  const batches = [...ingredient.batches].sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity));
  for (const batch of batches) totals.set(batch.unit, (totals.get(batch.unit) ?? 0) + batch.quantity);
  return { ...ingredient, batches, totals: [...totals].map(([unit, quantity]) => ({ unit, quantity })), expiryDate: batches.find((batch) => batch.expiryDate)?.expiryDate ?? null };
}
export function flattenStock(ingredients: IngredientStock[]) {
  return ingredients.flatMap((ingredient) => ingredient.batches.map((batch) => ({ name: ingredient.name, quantity: batch.quantity, unit: batch.unit })));
}
export async function readPantry(userId: string, conn?: Conn) {
  return pantryRepo.list(userId, conn);
}
export async function pantryStock(userId: string, conn?: Conn) {
  return flattenStock(await readPantry(userId, conn));
}
