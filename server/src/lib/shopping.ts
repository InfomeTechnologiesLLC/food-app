import { createHash } from "node:crypto";
import { normalize } from "./ingredients.js";
import { stockBalance, type StockItem } from "./stock.js";
import { convert } from "./units.js";

/** Remaining quantities to buy across all unmade meals, using each pantry amount once. */
export function buildShoppingList(meals: { ingredients: StockItem[]; made?: boolean }[], pantry: StockItem[]) {
  const shortage = stockBalance(pantry);
  const list: StockItem[] = [];
  for (const ing of meals.filter((meal) => !meal.made).flatMap((meal) => meal.ingredients)) {
    const quantity = shortage(ing);
    if (!quantity) continue;
    const existing = list.find((item) => normalize(item.name) === normalize(ing.name) && convert(quantity, ing.unit, item.unit) != null);
    if (existing) existing.quantity += convert(quantity, ing.unit, existing.unit)!;
    else list.push({ name: ing.name, quantity, unit: ing.unit });
  }
  return list.map((item) => ({ ...item, quantity: Math.ceil((item.quantity - 1e-6) * 100) / 100 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Outstanding requirements are derived data; purchase receipts live in StockOperation. */
export function shoppingRows(planId: string, revision: string, meals: { ingredients: StockItem[]; made?: boolean }[], pantry: StockItem[]) {
  return buildShoppingList(meals, pantry).map((item) => ({ ...item, _id: createHash("sha256")
    .update(JSON.stringify([planId, revision, normalize(item.name), item.unit, item.quantity]))
    .digest("hex").slice(0, 24) }));
}
