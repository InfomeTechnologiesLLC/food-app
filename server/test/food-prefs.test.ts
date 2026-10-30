import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { dietText, dislikesIn, preferenceLines, DIETS } from "../src/lib/food-prefs.js";
import { goalProgress, targetDays, targetSummary } from "../../mobile/src/lib/progress-core.js";

process.env.DATABASE_URL ??= "mysql://localhost/mealmind-test";
process.env.JWT_SECRET ??= "mealmind-test-secret-at-least-32-characters";
process.env.GEMINI_API_KEY ??= "mealmind-test-key";
const { geminiSchema } = await import("../src/ai/schema.js");
const { bodyGoalLine, workoutPrompt } = await import("../src/ai/exercise.js");

test("diets include non-vegetarian and eggetarian, with clear prompt text", () => {
  assert.ok(DIETS.includes("non_vegetarian") && DIETS.includes("eggetarian"));
  assert.match(dietText("non_vegetarian"), /chicken, mutton, fish and eggs/);
  assert.match(dietText("eggetarian"), /no meat or fish/);
  assert.equal(dietText("keto"), "keto");
});

test("preference lines include cuisine and dislikes only when set", () => {
  assert.equal(preferenceLines({ diet: "none" }), "- Diet: no restriction");
  const lines = preferenceLines({ diet: "vegetarian", cuisine: "India", dislikes: ["potato", "brinjal"] });
  assert.match(lines, /home cooking from "India"/);
  assert.match(lines, /"potato", "brinjal"/);
});

test("dislikes are matched in meal text", () => {
  assert.deepEqual(dislikesIn("Aloo gobi | potato | cauliflower", ["potato", "tomato"]), ["potato"]);
  assert.deepEqual(dislikesIn("Egg curry | egg | onion", ["potato"]), []);
  assert.deepEqual(dislikesIn("anything", undefined), []);
});

test("Gemini schema drops length and pattern rules but keeps structure and enums", () => {
  const schema = geminiSchema(z.object({ name: z.string().min(1).max(10).regex(/a/), kind: z.enum(["a", "b"]), n: z.number().max(5) }));
  const json = JSON.stringify(schema);
  assert.doesNotMatch(json, /minLength|maxLength|pattern|\$schema/);
  assert.match(json, /"enum":\["a","b"\]/);
  assert.match(json, /"maximum":5/);
});

test("the workout prompt follows the body goal", () => {
  assert.equal(bodyGoalLine(null), "");
  assert.match(bodyGoalLine({ direction: "gain", nutritionGoal: "muscle_gain", weeklyRateKg: 0.25 }), /BUILD MUSCLE/);
  const prompt = workoutPrompt({ startDate: "2026-11-02", timezone: "UTC", training: { enabled: true, goal: "general_fitness", experience: "beginner", equipment: [], weekdays: [1, 3, 5], sessionMinutes: 30, excludedExercises: [] } as never, body: {}, recentSessions: [], bodyGoal: { direction: "lose", nutritionGoal: "weight_loss", weeklyRateKg: -0.5 } });
  assert.match(prompt, /LOSE FAT/);
});

test("target days: calories within 10%, protein at least 90%, water goal; today is left out of counts", () => {
  const totals = {
    "2026-10-28": { meals: 1, calories: 500, proteinGrams: 20, carbsGrams: 0, fatGrams: 0 },
    "2026-10-27": { meals: 3, calories: 2050, proteinGrams: 110, carbsGrams: 0, fatGrams: 0 },
    "2026-10-26": { meals: 2, calories: 1500, proteinGrams: 60, carbsGrams: 0, fatGrams: 0 },
  };
  const days = targetDays(["2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25"], totals, { calories: 2000, proteinGrams: 120 }, { "2026-10-27": 2500, "2026-10-28": 3000 }, 2300);
  assert.deepEqual(days.map((d) => [d.calorieHit, d.proteinHit, d.waterHit]), [[false, false, true], [true, true, true], [false, false, false], [false, false, false]]);
  assert.deepEqual(targetSummary(days, "2026-10-28"), { days: 3, loggedDays: 2, calorieDays: 1, proteinDays: 1, waterDays: 1 });
  assert.ok(targetDays(["2026-10-27"], totals, null, {}, 0).every((d) => !d.calorieHit && !d.waterHit));
});

test("goal progress from the first weigh-in toward the target", () => {
  const w = (kg: number[]) => kg.map((weightKg, i) => ({ date: `2026-10-${10 + i}`, weightKg }));
  assert.equal(goalProgress(w([66, 68]), null), null);
  assert.deepEqual(goalProgress(w([66, 67, 69.5]), 80), { start: 66, current: 69.5, target: 80, percent: 25, leftKg: 10.5 });
  assert.deepEqual(goalProgress(w([90, 85]), 80), { start: 90, current: 85, target: 80, percent: 50, leftKg: -5 });
  assert.equal(goalProgress(w([66, 64]), 80)!.percent, 0); // moving the wrong way
});
