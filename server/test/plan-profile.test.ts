import { test } from "node:test";
import assert from "node:assert/strict";

// No real credentials or network calls are used for this prompt regression test.
process.env.MONGODB_URI = "mongodb://localhost/mealmind-test";
process.env.JWT_SECRET = "mealmind-test-secret";
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
  await generatePlan({ days: 1, mealTypes: ["dinner"], pantry: [], prefs: { diet: "none", allergies: [], goal: "balanced", budget: "low" }, maxExtraItems: null });
  assert.doesNotMatch(requests[1].contents, /- Height:|- Current weight:/);
  assert.match(requests[1].contents, /Budget: low/);
});
