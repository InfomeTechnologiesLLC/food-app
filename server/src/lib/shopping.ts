import { isAvailable, normalize } from "./ingredients.js";

interface Ingredient { name: string; quantity: number; unit: string; fromPantry: boolean }

/**
 * Everything the plan needs that isn't in the pantry, with duplicates merged.
 * Computed in code from the plan, so it doesn't cost an AI call. The pantry match is
 * by name only; quantities aren't subtracted because units rarely line up.
 */
export function buildShoppingList(meals: { ingredients: Ingredient[] }[], pantryNames: string[]) {
  const list = new Map<string, { name: string; quantity: number; unit: string }>();

  for (const ing of meals.flatMap((m) => m.ingredients)) {
    if (isAvailable(ing.name, pantryNames)) continue;

    const key = `${normalize(ing.name)}|${ing.unit.toLowerCase()}`;
    const existing = list.get(key);
    if (existing) existing.quantity += ing.quantity;
    else list.set(key, { name: ing.name, quantity: ing.quantity, unit: ing.unit });
  }

  return [...list.values()]
    .map((i) => ({ ...i, quantity: Math.round(i.quantity * 100) / 100 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
