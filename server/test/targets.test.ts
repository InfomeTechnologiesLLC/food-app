import { test } from "node:test";
import assert from "node:assert/strict";
import { bmr, calculateTargets, CALORIE_FLOOR, direction, waterTarget, type TargetInput, type Targets } from "../src/lib/targets.js";

const input = (over: Partial<TargetInput> = {}): TargetInput => ({
  sex: "male", birthYear: 1998, heightCm: 175, weightKg: 66, targetWeightKg: null, goal: "balanced",
  activityLevel: "moderate", goalWeeks: null, year: 2026, ...over,
});
const ready = (over: Partial<TargetInput> = {}) => {
  const t = calculateTargets(input(over));
  assert.equal(t.ready, true);
  return t as Targets;
};

test("Mifflin-St Jeor BMR", () => {
  assert.equal(bmr("male", 70, 175, 30), 1648.75);
  assert.equal(bmr("female", 60, 165, 30), 1320.25);
});

test("maintenance: calories equal TDEE and macros add up", () => {
  const t = ready();
  assert.equal(t.direction, "maintain");
  assert.equal(t.bmr, 1619); // 10*66 + 6.25*175 - 5*28 + 5
  assert.equal(t.tdee, Math.round(1618.75 * 1.55));
  assert.equal(t.calories, Math.round(t.tdee / 10) * 10);
  assert.equal(t.proteinGrams, Math.round(66 * 1.6));
  const kcal = t.proteinGrams * 4 + t.carbsGrams * 4 + t.fatGrams * 9;
  assert.ok(Math.abs(kcal - t.calories) <= 10, `macros give ${kcal} kcal for a ${t.calories} kcal target`);
  assert.equal(t.timeline, null);
  assert.match(t.notice, /not medical advice/);
});

test("spec example: 66 → 80 kg in 20 weeks is too fast, so the safe 0.5 kg/week timeline is returned", () => {
  const t = ready({ targetWeightKg: 80, goalWeeks: 20, goal: "muscle_gain" });
  assert.equal(t.direction, "gain");
  assert.equal(t.weeklyRateKg, 0.5);
  assert.equal(t.calories, Math.round((t.tdee + (0.5 * 7700) / 7) / 10) * 10);
  assert.deepEqual({ weeks: t.timeline!.weeks, adjusted: t.timeline!.adjusted }, { weeks: 28, adjusted: true });
  assert.match(t.timeline!.explanation, /healthy maximum of 0.5 kg/);
  assert.ok(t.proteinGrams >= 66 * 1.6 && t.proteinGrams <= 66 * 2.2);
});

test("a slow, safe timeframe is kept as asked", () => {
  const t = ready({ targetWeightKg: 80, goalWeeks: 56 });
  assert.equal(t.weeklyRateKg, 0.25);
  assert.deepEqual({ weeks: t.timeline!.weeks, adjusted: t.timeline!.adjusted }, { weeks: 56, adjusted: false });
});

test("without a timeframe the default pace is used: 0.5 kg/week to lose, 0.25 to gain", () => {
  assert.equal(ready({ weightKg: 90, targetWeightKg: 80, activityLevel: "active" }).weeklyRateKg, -0.5);
  assert.equal(ready({ goal: "muscle_gain" }).weeklyRateKg, 0.25);
  assert.equal(ready({ goal: "weight_loss", weightKg: 90 }).direction, "lose");
});

test("extreme deficits are refused: max 25% below TDEE and never under the calorie floor", () => {
  const t = ready({ sex: "female", heightCm: 160, weightKg: 85, targetWeightKg: 65, goalWeeks: 10, activityLevel: "sedentary" });
  assert.ok(t.calories >= Math.round(t.tdee * 0.75 / 10) * 10 - 10);
  assert.ok(t.calories >= CALORIE_FLOOR.female);
  assert.ok(t.weeklyRateKg > -1 && t.weeklyRateKg < 0);
  assert.equal(t.timeline!.adjusted, true);
  assert.match(t.timeline!.explanation, /safe level/);
  assert.ok(t.warnings.some((w) => /safe level/.test(w)));
});

test("a small person near the floor keeps their weight steady instead of starving", () => {
  const t = ready({ sex: "female", heightCm: 150, weightKg: 50, targetWeightKg: 45, activityLevel: "sedentary", birthYear: 1960 });
  assert.equal(t.calories, CALORIE_FLOOR.female);
  assert.equal(t.direction, "maintain");
  assert.ok(t.warnings.length > 0);
});

test("minors and underweight users get extra caution", () => {
  const minor = ready({ birthYear: 2012, targetWeightKg: 60 });
  assert.equal(minor.direction, "maintain");
  assert.match(minor.warnings[0]!, /under 18/);
  const under = ready({ weightKg: 52, targetWeightKg: 48 }); // BMI 17
  assert.equal(under.direction, "maintain");
  assert.match(under.warnings[0]!, /below the healthy range/);
  const underGain = ready({ weightKg: 52, targetWeightKg: 60 });
  assert.equal(underGain.direction, "gain");
  assert.match(underGain.warnings[0]!, /below the healthy range/);
});

test("protein uses a reference weight for high BMI", () => {
  const t = ready({ weightKg: 120, goal: "weight_loss" }); // BMI 39
  assert.equal(t.proteinGrams, Math.round(25 * 1.75 ** 2 * 2.0));
});

test("missing profile fields are listed, water is still given", () => {
  const t = calculateTargets(input({ sex: null, activityLevel: null }));
  assert.deepEqual(t, { ready: false, missing: ["sex", "activityLevel"], waterMl: 2300, notice: t.notice });
});

test("target weight decides direction; without one the goal does", () => {
  assert.equal(direction(70, 65, "muscle_gain"), "lose");
  assert.equal(direction(70, 70.3, "weight_loss"), "maintain");
  assert.equal(direction(70, null, "weight_loss"), "lose");
});

test("water: about 35 ml/kg, +500 ml when active, 1.5–4 L", () => {
  assert.equal(waterTarget(66, "moderate"), 2300);
  assert.equal(waterTarget(66, "very_active"), 2800);
  assert.equal(waterTarget(30, "light"), 1500);
  assert.equal(waterTarget(150, "active"), 4000);
  assert.equal(waterTarget(null, null), 2000);
});

test("targets are shown without a birth year, using an age of 30 and saying so", () => {
  const t = ready({ birthYear: null });
  assert.equal(t.age, 30);
  assert.equal(t.calories, ready({ birthYear: 1996 }).calories); // same as a 30-year-old in 2026
  assert.match(t.warnings[0]!, /Add your birth year/);
  const missing = calculateTargets(input({ birthYear: null, sex: null }));
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.ready ? [] : missing.missing, ["sex"]);
});
