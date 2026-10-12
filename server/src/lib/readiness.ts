import { stockBalance, type StockItem } from "./stock.js";

interface PlanLike {
  days: { day: number; meals: { ingredients: StockItem[] }[] }[];
  shoppingList: (StockItem & { checked: boolean })[];
}

/**
 * Marks each ingredient as available when actual pantry stock covers the meal
 * (staples are assumed available). Shopping checkmarks are not stock.
 */
export function annotateReadiness<T extends PlanLike>(plan: T, pantry: StockItem[]) {
  const have = pantry;
  let readyMeals = 0;
  let totalMeals = 0;

  const days = plan.days.map((d) => ({
    ...d,
    meals: d.meals.map((m) => {
      // Each meal is assessed on its own; repeated ingredients within it share a balance.
      const shortage = stockBalance(have);
      const ingredients = m.ingredients.map((i) => ({ ...i, available: shortage(i) === 0 }));
      const missing = ingredients.filter((i) => !i.available).map((i) => i.name);
      totalMeals++;
      if (missing.length === 0) readyMeals++;
      return { ...m, ingredients, missing, readyToCook: missing.length === 0 };
    }),
  }));

  return { ...plan, days, readyMeals, totalMeals };
}
