import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarToday, addDays, timezoneSchema, dateSchema } from "../src/lib/calendar.js";
import { dailyProgress } from "../../mobile/src/lib/daily-progress.js";
import type { MealPlan } from "../../mobile/src/lib/types.js";
test("server calendar dates honor midnight and date-line timezones", () => {
  const instant = new Date("2026-10-13T18:30:00Z");
  assert.equal(calendarToday("Asia/Kolkata", instant), "2026-10-14");
  assert.equal(calendarToday("America/Los_Angeles", instant), "2026-10-13");
  assert.equal(calendarToday("Pacific/Kiritimati", instant), "2026-10-14");
  assert.equal(timezoneSchema.safeParse("wrong/timezone").success, false);
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
});
test("calendar addition is stable across daylight-saving, month, leap-day, and year boundaries", () => {
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(calendarToday("America/New_York", new Date("2026-03-09T03:30:00Z")), "2026-03-08");
});
test("Home totals survive plan removal and count carried eaten meals only once", () => {
  const totals = { meals: 1, calories: 100, proteinGrams: 1, carbsGrams: 25, fatGrams: 0 };
  const removed = dailyProgress(undefined, totals, "2026-10-13");
  assert.equal(removed.eaten.calories, 100); assert.equal(removed.hasTarget, false);
  const plan = { days: [{ date: "2026-10-13", meals: [
    { eaten: true, calories: 100, nutrition: { proteinGrams: 1, carbsGrams: 25, fatGrams: 0 } },
    { eaten: false, calories: 200, nutrition: { proteinGrams: 2, carbsGrams: 50, fatGrams: 1 } },
  ] }] } as MealPlan;
  const progress = dailyProgress(plan, totals, "2026-10-13");
  assert.equal(progress.totalMeals, 2); assert.equal(progress.eatenMeals, 1);
  assert.equal(progress.planned.calories, 300); assert.equal(progress.eaten.calories, 100);
  assert.equal(dailyProgress(plan, undefined, "2026-10-14").totalMeals, 0);
});

test("readiness excludes eaten meals from current cooking requirements", async () => {
  const { annotateReadiness } = await import("../src/lib/readiness.js");
  const result = annotateReadiness({ days: [{ day: 1, meals: [
    { eaten: true, ingredients: [{ name: "banana", quantity: 3, unit: "pcs" }] },
    { eaten: false, ingredients: [{ name: "salt", quantity: 1, unit: "g" }] },
  ] }] }, []);
  assert.equal(result.totalMeals, 1); assert.equal(result.readyMeals, 1);
});
