import { MEAL_TYPES, type Meal, type MealPlan, type FoodHistoryEntry } from './types';
export const recipeKey = (meal: Meal | FoodHistoryEntry['meal']) => JSON.stringify({
  type: meal.type, title: meal.title, description: meal.description,
  prepMinutes: meal.prepMinutes, calories: meal.calories, nutrition: meal.nutrition,
  ingredients: meal.ingredients.map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
  steps: meal.steps, allergyWarnings: meal.allergyWarnings,
});
export function replacementChanges(current: Meal[], incoming: Meal[]) {
  const kept = current.filter((meal) => meal.eaten);
  const types = new Set(kept.map((meal) => meal.type));
  const next = [...kept, ...incoming.filter((meal) => !types.has(meal.type))];
  const keys = (meals: Meal[]) => [...meals].sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type)).map(recipeKey);
  return JSON.stringify(keys(current)) !== JSON.stringify(keys(next));
}

export function wholeReplacementChanges(current: MealPlan | undefined, draft: MealPlan, entries: FoodHistoryEntry[], date: string) {
  if (!current) return true;
  const kept = entries.map((entry) => entry.meal);
  const types = new Set(kept.map((meal) => meal.type));
  const signature = (days: { date?: string; meals: (Meal | FoodHistoryEntry['meal'])[] }[]) => JSON.stringify(days.map((day) => ({
    date: day.date, meals: [...day.meals].sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type)).map(recipeKey),
  })));
  const next = draft.days.map((day) => {
    const scheduled = new Date(`${date}T00:00:00Z`);
    scheduled.setUTCDate(scheduled.getUTCDate() + day.day - 1);
    return { date: scheduled.toISOString().slice(0, 10), meals: day.day === 1 ? [...kept, ...day.meals.filter((meal) => !types.has(meal.type))] : day.meals };
  });
  return signature(current.days) !== signature(next);
}
