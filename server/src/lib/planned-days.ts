/**
 * Pure helpers for the planned-days record (no database imports, so they are easy to test).
 * When a meal or workout plan is replaced or deleted, the days it covered that are already
 * over are saved, so progress tracking can still compare them with what the user did.
 */
export type PlannedKind = "meal" | "workout";
export interface PlannedDay { date: string; planned: number }

/** Days strictly before `today` that had something planned. Today and later belong to the next plan. */
export function pastPlannedDays(days: { date: string | null; planned: number }[], today: string): PlannedDay[] {
  return days.filter((d): d is PlannedDay => !!d.date && d.date < today && d.planned > 0);
}

/** Meals planned per day of a meal plan. */
export const mealPlanDays = (plan: { days: { date: string | null; meals: unknown[] }[] }) =>
  plan.days.map((d) => ({ date: d.date, planned: d.meals.length }));

/** A workout plan day counts as one planned workout when it has exercises (rest days count as nothing). */
export const workoutPlanDays = (plan: { days: { date: string; exercises: unknown[] }[] }) =>
  plan.days.map((d) => ({ date: d.date, planned: d.exercises.length > 0 ? 1 : 0 }));