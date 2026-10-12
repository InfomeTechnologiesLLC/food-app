import { stockBalance, type StockItem } from "./stock.js";

interface PlanLike {
  days: { day: number; meals: { ingredients: StockItem[] }[] }[];
  shoppingList: (StockItem & { checked: boolean })[];
}

/**
 * Marks each ingredient as available when pantry stock plus checked shopping quantities
 * cover the meal (staples are assumed available). Computed when the plan
 * is read, so a meal becomes "ready to cook" as soon as the user stocks up.
 */
export function annotateReadiness<T extends PlanLike>(plan: T, pantry: StockItem[]) {
  const have = [...pantry, ...plan.shoppingList.filter((i) => i.checked)];
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
