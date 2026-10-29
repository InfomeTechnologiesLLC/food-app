/**
 * Real data for the AI coach and the Today summary. Every number the coach talks about comes from
 * here (the database and lib/targets.ts), never from the AI. All results are small, plain JSON.
 */
import { userRepo, type UserDoc } from "../repos/users.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { waterRepo } from "../repos/water.js";
import { weightRepo } from "../repos/weights.js";
import { workoutPlanRepo, workoutSessionRepo } from "../repos/workouts.js";
import { readPantry } from "./pantry.js";
import { targetsForUser } from "./user-targets.js";
import { addDays } from "./calendar.js";
import { trendPerWeek } from "./check-in.js";
import type { Targets } from "./targets.js";

export type Macros = { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
const zero = (): Macros => ({ calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });
const r = (n: number) => Math.round(n);

/** What is left of the day's targets (can be negative when over). */
export function remainingMacros(targets: Macros, eaten: Macros): Macros {
  return {
    calories: r(targets.calories - eaten.calories), proteinGrams: r(targets.proteinGrams - eaten.proteinGrams),
    carbsGrams: r(targets.carbsGrams - eaten.carbsGrams), fatGrams: r(targets.fatGrams - eaten.fatGrams),
  };
}

export async function loadUser(userId: string): Promise<UserDoc> {
  const user = await userRepo.findById(userId);
  if (!user) throw new Error("Account not found");
  return user;
}

export function profileFor(user: UserDoc) {
  const b = user.body;
  return {
    goal: user.preferences.goal, diet: user.preferences.diet, allergies: user.preferences.allergies, budget: user.preferences.budget,
    heightCm: b.heightCm, weightKg: b.weightKg, targetWeightKg: b.targetWeightKg, sex: b.sex, birthYear: b.birthYear,
    activityLevel: b.activityLevel, goalWeeks: b.goalWeeks,
    training: { enabled: user.training.enabled, goal: user.training.goal, experience: user.training.experience, weekdays: user.training.weekdays },
  };
}

export function targetsFor(user: UserDoc) {
  return targetsForUser(user);
}

/** Meals marked as eaten (from plans or logged by the user) on `date`, with totals. */
export async function todayIntake(userId: string, date: string) {
  const entries = await foodHistoryRepo.list({ userId, date, reversed: false });
  const eaten = zero();
  for (const e of entries) {
    eaten.calories += e.meal.calories; eaten.proteinGrams += e.meal.nutrition.proteinGrams;
    eaten.carbsGrams += e.meal.nutrition.carbsGrams; eaten.fatGrams += e.meal.nutrition.fatGrams;
  }
  return {
    date,
    meals: entries.map((e) => ({ type: e.meal.type, title: e.meal.title, calories: e.meal.calories, proteinGrams: r(e.meal.nutrition.proteinGrams), loggedBy: e.sourcePlanId ? "meal plan" : "user" })),
    eaten: { calories: r(eaten.calories), proteinGrams: r(eaten.proteinGrams), carbsGrams: r(eaten.carbsGrams), fatGrams: r(eaten.fatGrams) },
  };
}

export async function waterToday(userId: string, date: string, goalMl: number) {
  const day = await waterRepo.day(userId, date);
  return { date, drankMl: day.totalMl, goalMl, leftMl: Math.max(0, goalMl - day.totalMl) };
}

/** Pantry items with total amounts per unit and days to the soonest expiry. Capped so prompts stay small. */
export async function pantrySummary(userId: string, now = new Date(), limit = 80) {
  const items = await readPantry(userId);
  return items.slice(0, limit).map((i) => {
    const totals = new Map<string, number>();
    for (const b of i.batches) totals.set(b.unit, (totals.get(b.unit) ?? 0) + b.quantity);
    const soonest = i.batches.map((b) => b.expiryDate?.getTime()).filter((t): t is number => t !== undefined).sort((a, b) => a - b)[0];
    return {
      name: i.name,
      amounts: [...totals].map(([unit, quantity]) => `${Math.round(quantity * 100) / 100} ${unit}`),
      expiresInDays: soonest === undefined ? null : Math.round((soonest - now.getTime()) / 86_400_000),
    };
  });
}

const completedSets = (s: { exercises: { sets: { status: string | null }[] }[] }) =>
  s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.status === "completed").length, 0);

/** Today's planned workout and the last 7 days of logged workouts. */
export async function workoutSummary(userId: string, date: string) {
  const [plan, sessions] = await Promise.all([workoutPlanRepo.findActive(userId), workoutSessionRepo.page(userId, { limit: 30 })]);
  const day = plan?.days.find((d) => d.date === date);
  const since = addDays(date, -6);
  const recent = sessions.filter((s) => s.date >= since && s.date <= date);
  const plannedDays = plan?.days.filter((d) => d.date >= since && d.date < date && d.exercises.length > 0).map((d) => d.date) ?? [];
  const doneDates = new Set(recent.filter((s) => completedSets(s) > 0).map((s) => s.date));
  return {
    hasPlan: !!plan,
    today: day ? { title: day.title, rest: day.exercises.length === 0, exercises: day.exercises.length, done: doneDates.has(date) } : null,
    last7Days: recent.map((s) => ({ date: s.date, title: s.title, completedSets: completedSets(s) })),
    missedThisWeek: plannedDays.filter((d) => !doneDates.has(d)).length,
  };
}

export async function weightSummary(userId: string, date: string) {
  const logs = await weightRepo.list(userId, 30);
  const weights = logs.map(({ date: d, weightKg }) => ({ date: d, weightKg }));
  return { latest: weights[0] ?? null, recent: weights.slice(0, 8), trendKgPerWeek: trendPerWeek(weights, date) };
}

/** Deterministic summary for GET /coach/today. */
export async function todaySummary(user: UserDoc, date: string) {
  const targets = targetsFor(user);
  const [intake, workouts] = await Promise.all([todayIntake(user._id, date), workoutSummary(user._id, date)]);
  const water = await waterToday(user._id, date, targets.waterMl);
  const ready = targets.ready ? (targets as Targets) : null;
  return {
    date,
    targets,
    eaten: intake.eaten,
    meals: intake.meals,
    remaining: ready ? remainingMacros(ready, intake.eaten) : null,
    water,
    workout: workouts.today,
    missedWorkoutsThisWeek: workouts.missedThisWeek,
  };
}
