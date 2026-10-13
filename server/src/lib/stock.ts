import { isStaple, sameIngredient } from "./ingredients.js";
import { convert } from "./units.js";

export interface StockItem { name: string; quantity: number; unit: string }

/** A private stock balance: callers decide whether to share it across meals. */
export function stockBalance(items: StockItem[]) {
  const assess = stockAssessment(items);
  return (ingredient: StockItem) => assess(ingredient).shortage;
}

export function stockAssessment(items: StockItem[]) {
  const stock = items.map((item) => ({ ...item }));
  return (ingredient: StockItem) => {
    if (isStaple(ingredient.name)) return { shortage: 0, have: ingredient.quantity, unitMismatch: false, incompatibleStock: [] as StockItem[] };
    const incompatibleStock = stock.filter((item) => item.quantity > 0 && sameIngredient(item.name, ingredient.name) && convert(item.quantity, item.unit, ingredient.unit) == null).map((item) => ({ ...item }));
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
    const shortage = needed > 1e-6 ? needed : 0;
    return { shortage, have: ingredient.quantity - shortage, unitMismatch: shortage > 0 && incompatibleStock.length > 0, incompatibleStock };
  };
}
