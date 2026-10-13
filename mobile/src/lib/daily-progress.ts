import type { MealPlan, NutritionTotals } from './types';
const emptyNutrition = () => ({ calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });
/** Eaten totals survive plan deletion; current uneaten meals supply the remaining target. */
export function dailyProgress(plan: MealPlan | undefined, history: NutritionTotals | undefined, date: string) {
  const day = plan?.days.find((day) => day.date === date);
  const remaining = day?.meals.filter((meal) => !meal.eaten) ?? [];
  const eaten = history ? { calories: history.calories, proteinGrams: history.proteinGrams, carbsGrams: history.carbsGrams, fatGrams: history.fatGrams } : emptyNutrition();
  const planned = { ...eaten };
  for (const meal of remaining) {
    const nutrition = { calories: meal.calories, ...meal.nutrition };
    for (const key of Object.keys(planned) as (keyof typeof planned)[]) planned[key] += nutrition[key];
  }
  return { eaten, planned, eatenMeals: history?.meals ?? 0, totalMeals: (history?.meals ?? 0) + remaining.length, hasTarget: !!day };
}
