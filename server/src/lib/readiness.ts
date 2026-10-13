import { stockAssessment, type StockItem } from "./stock.js";

interface PlanLike {
  days: { day: number; meals: { ingredients: StockItem[] }[] }[];
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
      const assess = stockAssessment(have);
      const ingredients = m.ingredients.map((i) => {
        const balance = assess(i);
        return { ...i, ...balance, available: balance.shortage === 0 };
      });
      const missing = ingredients.filter((i) => !i.available).map((i) => i.name);
      totalMeals++;
      if (missing.length === 0) readyMeals++;
      return { ...m, ingredients, missing, readyToCook: missing.length === 0 };
    }),
  }));

  return { ...plan, days, readyMeals, totalMeals };
}
