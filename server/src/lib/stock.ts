import { isStaple, sameIngredient } from "./ingredients.js";
import { convert } from "./units.js";

export interface StockItem { name: string; quantity: number; unit: string }

/** A private stock balance: callers decide whether to share it across meals. */
export function stockBalance(items: StockItem[]) {
  const stock = items.map((item) => ({ ...item }));
  return (ingredient: StockItem) => {
    if (isStaple(ingredient.name)) return 0;
    let needed = ingredient.quantity;
    for (const item of stock) {
      if (needed <= 1e-6) break;
      if (!sameIngredient(item.name, ingredient.name) || item.quantity <= 0) continue;
      const available = convert(item.quantity, item.unit, ingredient.unit);
      if (available == null) continue;
      const take = Math.min(needed, available);
      item.quantity -= convert(take, ingredient.unit, item.unit)!;
      needed -= take;
    }
    return needed > 1e-6 ? needed : 0;
  };
}
