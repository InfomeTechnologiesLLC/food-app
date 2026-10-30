/**
 * Real data for the AI coach and the Today summary. Every number the coach talks about comes from
 * here (the database and lib/targets.ts), never from the AI. All results are small, plain JSON.
 */
import { userRepo, type UserDoc } from "../repos/users.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { waterRepo } from "../repos/water.js";
import { weightRepo } from "../repos/weights.js";
import { workoutPlanRepo, workoutSessionRepo } from "../repos/workouts.js";
import { mealPlanRepo } from "../repos/meal-plans.js";
import { periodRepo } from "../repos/period.js";
import { exerciseById } from "../domain/exercise.js";
import { GENERAL_COMFORT_FOODS, periodStatus } from "./period.js";
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

export async function weightSummary(userId: string, date: string, targetWeightKg: number | null = null) {
  const logs = await weightRepo.list(userId, 30);
  const weights = logs.map(({ date: d, weightKg }) => ({ date: d, weightKg }));
  const latest = weights[0] ?? null;
  const last = weights[0]?.date;
  return {
    latest, recent: weights.slice(0, 8), trendKgPerWeek: trendPerWeek(weights, date), targetWeightKg,
    kgToTarget: latest && targetWeightKg !== null ? Math.round((latest.weightKg - targetWeightKg) * 10) / 10 : null,
    daysSinceLastWeighIn: last ? Math.round((Date.parse(date) - Date.parse(last)) / 86_400_000) : null,
  };
}

/** Saves a weigh-in for `date` (replacing one on the same day) and keeps the profile's current weight in step. */
export async function logWeight(userId: string, date: string, weightKg: number) {
  await weightRepo.upsert(userId, date, weightKg);
  const [latest] = await weightRepo.list(userId, 1);
  if (latest) await userRepo.updateBody(userId, { weightKg: latest.weightKg, weightUpdatedAt: latest.recordedAt });
}

const exerciseLine = (e: { exerciseId: string; sets: number | null; repsMin: number | null; repsMax: number | null; durationSeconds: number | null }) => {
  const name = exerciseById(e.exerciseId)?.name ?? e.exerciseId;
  const amount = e.durationSeconds ? `${Math.round(e.durationSeconds / 60) || 1} min`
    : e.repsMin ? `${e.sets ?? 1} × ${e.repsMin}${e.repsMax && e.repsMax !== e.repsMin ? `–${e.repsMax}` : ""}` : `${e.sets ?? 1} sets`;
  return `${name} ${amount}`;
};

/** The active workout plan from `date` for 7 days: title, exercises and whether each day is done. */
export async function workoutWeek(userId: string, date: string) {
  const [plan, sessions] = await Promise.all([workoutPlanRepo.findActive(userId), workoutSessionRepo.page(userId, { limit: 30 })]);
  if (!plan) return { hasPlan: false, days: [] };
  const done = new Set(sessions.filter((s) => completedSets(s) > 0).map((s) => s.date));
  const end = addDays(date, 6);
  return {
    hasPlan: true,
    days: plan.days.filter((d) => d.date >= addDays(date, -1) && d.date <= end).map((d) => ({
      date: d.date, title: d.title, rest: d.exercises.length === 0, done: done.has(d.date), exercises: d.exercises.map(exerciseLine),
    })),
  };
}

/** Meals in the active meal plans for `date` and the next `days - 1` days. */
export async function mealPlanSummary(userId: string, date: string, days = 3) {
  const plans = await mealPlanRepo.listActive(userId);
  const end = addDays(date, days - 1);
  const out = plans.flatMap((p) => p.days).filter((d) => d.date && d.date >= date && d.date <= end)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1))
    .map((d) => ({ date: d.date, meals: d.meals.map((m) => ({ type: m.type, title: m.title, calories: m.calories, proteinGrams: Math.round(m.nutrition.proteinGrams), eaten: m.eaten })) }));
  return { hasPlan: out.length > 0, days: out };
}

/** Period status for users who track it; `tracking: false` otherwise, so the coach doesn't bring it up. */
export async function periodSummary(user: UserDoc, date: string) {
  if (!user.period.tracking || user.body.sex !== "female") return { tracking: false };
  const logs = await periodRepo.list(user._id);
  const status = periodStatus(logs, user.period, date);
  const [checkin] = status.onPeriod ? await periodRepo.pains(user._id, date, date) : [];
  return {
    tracking: true,
    onPeriod: status.onPeriod, dayOfPeriod: status.dayOfPeriod, nextStart: status.nextStart, daysUntilNext: status.daysUntilNext,
    painToday: checkin?.pain ?? null,
    exerciseDuringPeriod: user.period.exercise,
    comfortFoods: user.period.comfortFoods.length ? user.period.comfortFoods : GENERAL_COMFORT_FOODS,
  };
}

/** The last 7 days: calories eaten, water drunk and workouts done per day, against the targets. */
export async function weekSummary(user: UserDoc, date: string) {
  const from = addDays(date, -6);
  const targets = targetsFor(user);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const [food, water, sessions] = await Promise.all([
    foodHistoryRepo.totalsByDate({ userId: user._id, reversed: false }, dates),
    waterRepo.totals(user._id, from, date),
    workoutSessionRepo.page(user._id, { limit: 30 }),
  ]);
  const days = dates.map((d) => ({
    date: d,
    calories: r(food.find((f) => f.date === d)?.calories ?? 0),
    waterMl: water.find((w) => w.date === d)?.totalMl ?? 0,
    workoutDone: sessions.some((s) => s.date === d && completedSets(s) > 0),
  }));
  return {
    targets: targets.ready ? { calories: targets.calories, waterMl: targets.waterMl } : { waterMl: targets.waterMl },
    days,
    daysWithFoodLogged: days.filter((d) => d.calories > 0).length,
    daysWaterGoalMet: days.filter((d) => d.waterMl >= targets.waterMl).length,
    workoutsDone: days.filter((d) => d.workoutDone).length,
  };
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
