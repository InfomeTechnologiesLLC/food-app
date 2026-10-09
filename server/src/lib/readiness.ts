import { isAvailable } from "./ingredients.js";

interface PlanLike {
  days: { day: number; meals: { ingredients: { name: string }[] }[] }[];
  shoppingList: { name: string; checked: boolean }[];
}

/**
 * Marks each ingredient as available (in the pantry right now, a staple, or ticked as bought
 * on this plan's shopping list) and each meal with what's still missing. Computed when the plan
 * is read, so a meal becomes "ready to cook" as soon as the user stocks up.
 */
export function annotateReadiness<T extends PlanLike>(plan: T, pantryNames: string[]) {
  const have = [...pantryNames, ...plan.shoppingList.filter((i) => i.checked).map((i) => i.name)];
  let readyMeals = 0;
  let totalMeals = 0;

  const days = plan.days.map((d) => ({
    ...d,
    meals: d.meals.map((m) => {
      const ingredients = m.ingredients.map((i) => ({ ...i, available: isAvailable(i.name, have) }));
      const missing = ingredients.filter((i) => !i.available).map((i) => i.name);
      totalMeals++;
      if (missing.length === 0) readyMeals++;
      return { ...m, ingredients, missing, readyToCook: missing.length === 0 };
    }),
  }));

  return { ...plan, days, readyMeals, totalMeals };
}
