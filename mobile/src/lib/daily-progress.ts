import { planDayDate, today } from '@/lib/plans';
import type { MealPlan } from '@/lib/types';

const emptyNutrition = () => ({ calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });

/** Totals for the meals scheduled on the user's local calendar date. */
export function dailyProgress(plan: MealPlan, date = today()) {
  const meals = plan.startDate
    ? plan.days.find((day) => planDayDate(plan.startDate!, day.day).toDateString() === date.toDateString())?.meals ?? []
    : [];
  const planned = emptyNutrition();
  const made = emptyNutrition();
  let madeMeals = 0;

  for (const meal of meals) {
    const nutrition = { calories: meal.calories, ...meal.nutrition };
    for (const key of Object.keys(planned) as (keyof typeof planned)[]) {
      planned[key] += nutrition[key];
      if (meal.made) made[key] += nutrition[key];
    }
    if (meal.made) madeMeals++;
  }

  return { planned, made, madeMeals, totalMeals: meals.length };
}
