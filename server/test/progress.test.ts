import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStatus, exerciseDays, foodDays, lastDates, plannedByDate, summarize, verdict } from "../../mobile/src/lib/progress-core.js";
import { assessWeight, buildCoach, weeklyTrend, type CoachInput } from "../../mobile/src/lib/coach.js";
import { planActivityReminders, type ActivityState } from "../../mobile/src/lib/activity-reminders.js";
import { parseMeasurements } from "../../mobile/src/lib/measurements.js";
import { mealPlanDays, pastPlannedDays, workoutPlanDays } from "../src/lib/planned-days.js";

const TODAY = "2026-10-28"; // a Wednesday
const day = (meals: number) => ({ meals, calories: 1800, proteinGrams: 90, carbsGrams: 200, fatGrams: 60 });
const uneaten = (n: number) => Array.from({ length: n }, () => ({ eaten: false, calories: 600, nutrition: { proteinGrams: 30, carbsGrams: 60, fatGrams: 20 } }));

// ── progress-core ──

test("lastDates is newest first, ends today and crosses month ends", () => {
  assert.deepEqual(lastDates(3, "2026-11-01"), ["2026-11-01", "2026-10-31", "2026-10-30"]);
  assert.equal(lastDates(30, TODAY).length, 30);
});

test("dayStatus and verdict", () => {
  assert.equal(dayStatus(0, 0, false), "unplanned");
  assert.equal(dayStatus(3, 3, false), "complete");
  assert.equal(dayStatus(1, 3, true), "pending");
  assert.equal(dayStatus(1, 3, false), "partial");
  assert.equal(dayStatus(0, 3, false), "missed");
  assert.equal(verdict(0, 0), "no_plan");
  assert.equal(verdict(8, 10), "on_track");
  assert.equal(verdict(5, 10), "behind");
  assert.equal(verdict(4, 10), "off_track");
});

test("summarize skips today and unplanned days, and caps extra meals", () => {
  const s = summarize([
    { done: 0, planned: 3, status: "pending" },
    { done: 4, planned: 3, status: "complete" },
    { done: 2, planned: 0, status: "unplanned" },
    { done: 3, planned: 3, status: "complete" },
    { done: 1, planned: 3, status: "partial" },
  ]);
  assert.deepEqual(s, { done: 7, planned: 9, percent: 78, streak: 2, verdict: "behind" });
});

test("replacing a meal plan keeps the earlier days counted (regression)", () => {
  const dates = lastDates(7, TODAY);
  const totals = Object.fromEntries(dates.slice(1).map((d) => [d, day(3)]));
  const newPlan = { days: [{ date: TODAY, meals: uneaten(3) }] } as never;
  // Before the fix: with only the new plan, every earlier day was "unplanned" and the week showed no plan
  assert.equal(summarize(foodDays(dates, totals, newPlan, TODAY)).verdict, "no_plan");
  // With the saved days of the old plan, the week is complete
  const saved = plannedByDate(dates.slice(1).map((date) => ({ kind: "meal" as const, date, planned: 3 })), "meal");
  const days = foodDays(dates, totals, newPlan, TODAY, saved);
  assert.equal(days[0]!.status, "pending");
  assert.deepEqual(summarize(days), { done: 18, planned: 18, percent: 100, streak: 6, verdict: "on_track" });
});

test("the current plan wins over saved rows for the days it covers", () => {
  const plan = { days: [{ date: TODAY, meals: uneaten(2) }] } as never;
  const [today] = foodDays([TODAY], {}, plan, TODAY, { [TODAY]: 5 });
  assert.equal(today!.planned, 2);
});

test("exerciseDays counts a planned day as done once a set is completed", () => {
  const session = (date: string, status: string) => ({ date, title: "Legs", exercises: [{ sets: [{ status }] }] }) as never;
  const days = exerciseDays(["2026-10-27", "2026-10-26", "2026-10-25"], [session("2026-10-27", "completed"), session("2026-10-26", "skipped")], new Set(["2026-10-27", "2026-10-26"]), TODAY);
  assert.deepEqual(days.map((d) => d.status), ["complete", "missed", "unplanned"]);
  assert.equal(days[0]!.sets, 1);
});

// ── planned-days (server) ──

test("pastPlannedDays keeps only finished days that had something planned", () => {
  const meal = mealPlanDays({ days: [{ date: "2026-10-26", meals: [1, 2, 3] }, { date: "2026-10-27", meals: [] }, { date: TODAY, meals: [1] }, { date: null, meals: [1] }] });
  assert.deepEqual(pastPlannedDays(meal, TODAY), [{ date: "2026-10-26", planned: 3 }]);
  const workout = workoutPlanDays({ days: [{ date: "2026-10-26", exercises: [1] }, { date: "2026-10-27", exercises: [] }, { date: "2026-10-29", exercises: [1] }] });
  assert.deepEqual(pastPlannedDays(workout, TODAY), [{ date: "2026-10-26", planned: 1 }]);
});

// ── coach ──

const coachInput = (over: Partial<CoachInput>): CoachInput => ({
  goal: "weight_loss", heightCm: 175, weightKg: 80, targetWeightKg: null, weights: [], today: TODAY,
  food: { hasPlan: true, rate: { percent: 100, planned: 21, done: 21 }, todayDone: 0, todayPlanned: 0 },
  exercise: { enabled: false, hasPlan: false, rate: { percent: null, planned: 0, done: 0 }, todayPlanned: false, todayDone: false, daysSinceLast: null, missed: 0 },
  ...over,
});
const series = (perWeek: number) => [0, 7, 14].map((d, i) => ({ date: lastDates(15, TODAY)[14 - d]!, weightKg: 80 + perWeek * i }));

test("weeklyTrend needs a week of data", () => {
  assert.equal(weeklyTrend([{ date: "2026-10-25", weightKg: 80 }, { date: TODAY, weightKg: 79 }], TODAY), null);
  assert.equal(weeklyTrend(series(-0.5), TODAY), -0.5);
});

test("coach rate limits follow the spec (loss 0.25–1, gain 0.25–0.5 kg a week)", () => {
  const status = (goal: string, perWeek: number) => assessWeight(coachInput({ goal, weights: series(perWeek) })).headline;
  assert.equal(status("weight_loss", -1), "Losing steadily");
  assert.equal(status("weight_loss", -1.2), "Losing faster than recommended");
  assert.equal(status("weight_loss", -0.2), "Weight is not moving yet");
  assert.equal(status("muscle_gain", 0.3), "Gaining steadily");
  assert.equal(status("muscle_gain", 0.6), "Gaining quickly");
});

test("coach flags a target that points the wrong way", () => {
  const coach = buildCoach(coachInput({ targetWeightKg: 90, weights: series(-0.5) }));
  assert.ok(coach.tips.some((t) => t.id === "target-mismatch"));
});

// ── reminders ──

const reminderState = (over: Partial<ActivityState> = {}): ActivityState => ({
  now: new Date(2026, 9, 28, 10), today: TODAY,
  meals: { enabled: true, hour: 19, planDates: [TODAY, "2026-10-29"], eatenToday: 0, plannedToday: 3 },
  workout: { enabled: true, hour: 18, plannedDates: [TODAY], doneToday: false },
  weighIn: { enabled: true, hour: 8, daysSinceLast: null },
  ...over,
});

test("activity reminders skip what is already done today", () => {
  const all = planActivityReminders(reminderState());
  assert.equal(all.filter((r) => r.kind === "meal-reminder").length, 2);
  assert.equal(all.filter((r) => r.kind === "workout-reminder").length, 1);
  assert.equal(all.filter((r) => r.kind === "weigh-in-reminder").length, 2); // the next two Sundays
  const done = planActivityReminders(reminderState({
    meals: { ...reminderState().meals, eatenToday: 3 }, workout: { ...reminderState().workout, doneToday: true }, weighIn: { enabled: true, hour: 8, daysSinceLast: 0 },
  }));
  assert.deepEqual(done.map((r) => r.kind), ["meal-reminder", "weigh-in-reminder"]); // tomorrow's meals, and the Sunday after next
});

// ── measurements ──

test("parseMeasurements only touches the target weight when one is passed", () => {
  assert.deepEqual(parseMeasurements("170", "66"), { heightCm: 170, weightKg: 66 });
  assert.deepEqual(parseMeasurements("170", "66", ""), { heightCm: 170, weightKg: 66, targetWeightKg: null });
  assert.deepEqual(parseMeasurements("", "66,5", "80"), { heightCm: null, weightKg: 66.5, targetWeightKg: 80 });
  assert.throws(() => parseMeasurements("", "", "5"), /Target weight/);
});