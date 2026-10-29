import { test } from "node:test";
import assert from "node:assert/strict";

// No real credentials or network calls are used for this prompt regression test.
process.env.DATABASE_URL = "mysql://localhost/mealmind-test";
process.env.JWT_SECRET = "mealmind-test-secret-at-least-32-characters";
process.env.GEMINI_API_KEY = "mealmind-test-key";
const { gemini } = await import("../src/ai/gemini.js");
const { generatePlan } = await import("../src/ai/plan.js");

test("plans serve one person and include optional measurements", async (t) => {
  const requests: any[] = [];
  t.mock.method(gemini.models, "generateContent", async (request: any) => {
    requests.push(request);
    return { text: JSON.stringify({ title: "Personal plan", days: [{ day: 1, meals: [] }] }) };
  });
  const prefs = { diet: "none", allergies: [], goal: "weight_loss", budget: "medium", heightCm: 170, weightKg: 65 };
  await generatePlan({ days: 1, mealTypes: ["dinner"], pantry: [], prefs, maxExtraItems: 0 });
  const prompt = requests[0].contents as string;
  assert.match(prompt, /Every meal serves exactly one person/);
  assert.match(prompt, /Height: 170 cm/);
  assert.match(prompt, /Current weight: 65 kg/);
  assert.doesNotMatch(prompt, /Budget:/);
  assert.match(prompt, /Do not infer health status/);
  await generatePlan({ days: 1, mealTypes: ["dinner"], pantry: [], prefs: { diet: "none", allergies: [], goal: "balanced", budget: "low" }, maxExtraItems: null, trainingContext: { goal: "strength", days: [{ date: "2026-10-13", title: "Strength session", exercises: [] }] } });
  assert.doesNotMatch(requests[1].contents, /- Height:|- Current weight:/);
  assert.match(requests[1].contents, /Budget: low/);
  assert.match(requests[1].contents, /TRAINING CONTEXT/);
  assert.match(requests[1].contents, /Strength session/);
  assert.match(requests[1].contents, /Do not estimate exercise calorie credits/);
});

test("recipes that use a unit the pantry can't match are retried once with the pantry's unit", async (t) => {
  const { unitMismatches } = await import("../src/ai/plan.js");
  const meal = (unit: string) => ({ type: "breakfast" as const, title: "Eggs", description: "Eggs", prepMinutes: 5, calories: 200, nutrition: { proteinGrams: 12, carbsGrams: 1, fatGrams: 14 },
    ingredients: [{ name: "eggs", quantity: 2, unit, fromPantry: true }, { name: "salt", quantity: 1, unit: "pinch", fromPantry: true }], steps: ["Cook"] });
  const pantry = [{ name: "egg", quantity: 1, unit: "pack", expiresInDays: 10 }];
  assert.deepEqual(unitMismatches([meal("pcs")], pantry), ['eggs (recipe used "pcs", pantry has pack)']);
  assert.deepEqual(unitMismatches([meal("pack")], pantry), []);
  assert.deepEqual(unitMismatches([meal("pcs")], [{ name: "egg", quantity: 12, unit: "pcs", expiresInDays: 10 }]), []);
  const prompts: string[] = [];
  t.mock.method(gemini.models, "generateContent", async (request: any) => {
    prompts.push(request.contents);
    return { text: JSON.stringify({ title: "Plan", days: [{ day: 1, meals: [meal(prompts.length === 1 ? "pcs" : "pack")] }] }) };
  });
  const plan = await generatePlan({ days: 1, mealTypes: ["breakfast"], pantry, prefs: { diet: "none", allergies: [], goal: "balanced", budget: "low" }, maxExtraItems: null });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1]!, /cannot be matched to the pantry: eggs \(recipe used "pcs", pantry has pack\)/);
  assert.equal(plan.days[0]!.meals[0]!.ingredients[0]!.unit, "pack");
});
test("daily targets are scaled to the chosen meals and given to the planner", async (t) => {
  const { mealTargets } = await import("../src/ai/plan.js");
  const daily = { calories: 2500, proteinGrams: 120, carbsGrams: 300, fatGrams: 70 };
  assert.deepEqual(mealTargets(daily, ["breakfast", "lunch", "dinner", "snack"]), { share: 1, ...daily });
  assert.deepEqual(mealTargets(daily, ["lunch", "dinner"]), { share: 0.65, calories: 1630, proteinGrams: 78, carbsGrams: 195, fatGrams: 46 });
  const requests: any[] = [];
  t.mock.method(gemini.models, "generateContent", async (request: any) => {
    requests.push(request);
    return { text: JSON.stringify({ title: "Targeted plan", days: [{ day: 1, meals: [] }] }) };
  });
  const prefs = { diet: "none", allergies: [], goal: "muscle_gain", budget: "medium" };
  await generatePlan({ days: 1, mealTypes: ["lunch", "dinner"], pantry: [], prefs, maxExtraItems: null, dailyTargets: daily });
  assert.match(requests[0].contents, /about 1630 kcal, 78 g protein, 195 g carbs and 46 g fat for these meals \(about 65% of the day's food\)/);
  assert.doesNotMatch(requests[0].contents, /Do not infer health status/);
});
