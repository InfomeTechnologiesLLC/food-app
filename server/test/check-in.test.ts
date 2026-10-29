import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIn, trendPerWeek, MAX_ADJUSTMENT, type CheckInInput } from "../src/lib/check-in.js";
import { addDays } from "../src/lib/calendar.js";
import { calculateTargets } from "../src/lib/targets.js";

// The coach module loads the Gemini client, which needs these settings; no network calls are made.
process.env.DATABASE_URL ??= "mysql://localhost/mealmind-test";
process.env.JWT_SECRET ??= "mealmind-test-secret-at-least-32-characters";
process.env.GEMINI_API_KEY ??= "mealmind-test-key";
const { mealAim, mealTypeForHour } = await import("../src/ai/coach.js");

const TODAY = "2026-10-28";
/** Weigh-ins every 7 days for the last 14 days, changing by `perWeek`. */
const weights = (perWeek: number, start = 70) => [14, 7, 0].map((ago, i) => ({ date: addDays(TODAY, -ago), weightKg: start + perWeek * i }));
const input = (over: Partial<CheckInInput>): CheckInInput => ({
  today: TODAY, lastCheckIn: null, direction: "gain", plannedRate: 0.5, weights: weights(0.5), currentAdjustment: 0, ...over,
});

test("trend needs weigh-ins covering about two weeks", () => {
  assert.equal(trendPerWeek(weights(0.5).slice(1), TODAY), null); // only 7 days
  assert.equal(trendPerWeek(weights(0.5), TODAY), 0.5);
  assert.equal(trendPerWeek([...weights(0.5), { date: addDays(TODAY, -40), weightKg: 50 }], TODAY), 0.5); // old ones ignored
});

test("runs at most once every 7 days", () => {
  assert.deepEqual(checkIn(input({ lastCheckIn: addDays(TODAY, -6) })), { due: false });
  assert.equal(checkIn(input({ lastCheckIn: addDays(TODAY, -7) })).due, true);
});

test("not enough data: due, but no change", () => {
  const r = checkIn(input({ weights: [] }));
  assert.ok(r.due && r.deltaKcal === 0 && /Not enough weigh-ins/.test(r.reason));
});

test("gaining: no gain → +200, slow → +150, on plan → 0, too fast → -150", () => {
  const delta = (perWeek: number) => { const r = checkIn(input({ weights: weights(perWeek) })); assert.ok(r.due); return r.deltaKcal; };
  assert.equal(delta(0), 200);
  assert.equal(delta(0.25), 150);
  assert.equal(delta(0.5), 0);
  assert.equal(delta(0.6), 0);
  assert.equal(delta(0.8), -150);
});

test("losing: not losing → -200, slow → -150, on plan → 0, too fast → +150", () => {
  const delta = (perWeek: number) => { const r = checkIn(input({ direction: "lose", plannedRate: -0.5, weights: weights(perWeek, 90) })); assert.ok(r.due); return r.deltaKcal; };
  assert.equal(delta(0.1), -200);
  assert.equal(delta(-0.25), -150);
  assert.equal(delta(-0.5), 0);
  assert.equal(delta(-0.9), 150);
});

test("maintaining: only a clear drift changes calories", () => {
  const r = checkIn(input({ direction: "maintain", plannedRate: 0, weights: weights(0.4) }));
  assert.ok(r.due && r.deltaKcal === -150 && /keep it steady/.test(r.reason));
  const steady = checkIn(input({ direction: "maintain", plannedRate: 0, weights: weights(0.1) }));
  assert.ok(steady.due && steady.deltaKcal === 0);
});

test("total adjustment is capped", () => {
  const r = checkIn(input({ weights: weights(0), currentAdjustment: MAX_ADJUSTMENT - 50 }));
  assert.ok(r.due && r.deltaKcal === 50 && /capped/.test(r.reason));
  const full = checkIn(input({ weights: weights(0), currentAdjustment: MAX_ADJUSTMENT }));
  assert.ok(full.due && full.deltaKcal === 0 && /maximum/.test(full.reason));
});

test("an adjustment never breaks the calorie floor or the deficit cap", () => {
  const base = { sex: "female" as const, birthYear: 1990, heightCm: 160, weightKg: 70, targetWeightKg: 60, goal: "weight_loss", activityLevel: "light" as const, goalWeeks: null, year: 2026 };
  const plain = calculateTargets(base);
  const cut = calculateTargets({ ...base, adjustmentKcal: -600 });
  assert.ok(plain.ready && cut.ready);
  assert.ok(cut.calories >= Math.max(1200, Math.round(cut.tdee * 0.75 / 10) * 10 - 10));
  assert.equal(cut.adjustmentKcal, cut.calories - plain.calories);
  const up = calculateTargets({ ...base, adjustmentKcal: 150 });
  assert.ok(up.ready && up.calories === plain.calories + 150 && up.adjustmentKcal === 150);
});

test("next meal: type from the hour, and its share of what is left", () => {
  assert.deepEqual([7, 12, 16, 20].map(mealTypeForHour), ["breakfast", "lunch", "snack", "dinner"]);
  const left = { calories: 1600, proteinGrams: 80, carbsGrams: 200, fatGrams: 50 };
  // lunch (0.35) of lunch + snack + dinner (0.75)
  assert.deepEqual(mealAim(left, "lunch"), { calories: 750, proteinGrams: 37, carbsGrams: 93, fatGrams: 23 });
  assert.deepEqual(mealAim(left, "dinner"), left);
});
