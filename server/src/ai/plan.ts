import { z } from "zod";
import { gemini, GEMINI_MODEL, withRetry, AIError } from "./gemini.js";
import { extraIngredients, findAllergens, STAPLES } from "../lib/ingredients.js";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const ingredientSchema = z.object({
  name: z.string().describe("Generic ingredient name, lowercase, singular"),
  quantity: z.number().describe("Total amount needed for all servings"),
  unit: z.string(),
  fromPantry: z.boolean().describe("true if this comes from the user's pantry list or is a basic staple"),
});

const mealSchema = z.object({
  type: z.enum(MEAL_TYPES),
  title: z.string(),
  description: z.string().describe("One appetizing sentence"),
  prepMinutes: z.number().int(),
  calories: z.number().int().nonnegative().describe("Approximate kcal per serving"),
  nutrition: z.object({
    proteinGrams: z.number().nonnegative().describe("Approximate protein in grams per serving"),
    carbsGrams: z.number().nonnegative().describe("Approximate carbohydrates in grams per serving"),
    fatGrams: z.number().nonnegative().describe("Approximate fat in grams per serving"),
  }),
  ingredients: z.array(ingredientSchema),
  steps: z.array(z.string()).describe("3 to 7 short cooking steps"),
});

const planSchema = z.object({
  title: z.string().describe("Short catchy plan name, e.g. 'Veggie-forward week'"),
  days: z.array(z.object({ day: z.number().int(), meals: z.array(mealSchema) })),
});

export type GeneratedPlan = z.infer<typeof planSchema>;
type Meal = z.infer<typeof mealSchema>;

export interface PlanInput {
  days: number;
  mealTypes: MealType[];
  pantry: { name: string; quantity: number; unit: string; expiresInDays: number | null }[];
  prefs: { diet: string; allergies: string[]; goal: string; budget: string; servings: number };
  /** Max distinct ingredients the user is willing to buy. 0 = pantry only, null = no limit. */
  maxExtraItems: number | null;
}

const GOALS: Record<string, string> = {
  balanced: "balanced, varied nutrition",
  weight_loss: "a moderate calorie deficit: high protein, high fibre, lighter portions",
  muscle_gain: "high protein with enough calories to support muscle gain",
  budget: "the lowest possible cost",
};

function shoppingRule(maxExtraItems: number | null, days: number) {
  if (maxExtraItems === 0) {
    return `PANTRY ONLY: the user will NOT buy anything. Use only pantry items and the staples listed below, nothing else. No garnish or "optional" extras either. If the pantry is thin, make simpler meals or reuse ingredients in different ways rather than adding anything.`;
  }
  if (maxExtraItems == null) {
    return `Add affordable extra ingredients where they make meals tastier, more varied or better balanced. Reuse extras across meals. Aim for about ${Math.min(4 + days * 2, 15)} extra items in total.`;
  }
  return `The user will buy AT MOST ${maxExtraItems} distinct extra ingredient${maxExtraItems === 1 ? "" : "s"} for the whole plan (pantry items and staples don't count). Pick extras that unlock the most meals, and reuse each extra across several meals. Meals that need no extras are welcome.`;
}

function buildPrompt({ days, mealTypes, pantry, prefs, maxExtraItems }: PlanInput) {
  const pantryLines = pantry.length
    ? pantry
        .map((p) => `- ${p.name}: ${p.quantity} ${p.unit}${p.expiresInDays == null ? "" : p.expiresInDays <= 0 ? " (EXPIRES TODAY)" : ` (expires in ${p.expiresInDays}d)`}`)
        .join("\n")
    : "(empty: plan simple, affordable meals)";

  return `Create a ${days}-day meal plan with these meals each day: ${mealTypes.join(", ")}.

USER PANTRY:
${pantryLines}

USER PROFILE:
- Diet: ${prefs.diet === "none" ? "no restriction" : prefs.diet}
- Goal: ${GOALS[prefs.goal] ?? prefs.goal}
- Budget: ${prefs.budget}
- Servings per meal: ${prefs.servings} (ingredient quantities must cover all servings)

RULES:
1. Build meals around what's in the pantry. Use items that expire soonest in the earliest days.
2. ${shoppingRule(maxExtraItems, days)}
3. Variety matters: never repeat a dish, rotate proteins, cooking methods and cuisines, and don't serve the same main ingredient at every meal of a day.
4. Assume these staples are always available and mark them fromPantry=true: ${STAPLES.join(", ")}.
5. Set fromPantry=true only for pantry items or staples. Everything else is fromPantry=false. Every ingredient a dish's title implies (e.g. garlic in "garlic chicken") must be listed.
6. Realistic home cooking: weekday meals under 40 minutes, simple techniques.
7. Number the days from 1 to ${days}.
8. Estimate calories and nutrition from the complete recipe, including cooking oils and all other ingredients. Divide recipe totals by ${prefs.servings} to report kcal, proteinGrams, carbsGrams and fatGrams PER SERVING. Ingredient quantities must still cover all ${prefs.servings} servings.`;
}

function systemInstruction(allergies: string[]) {
  const allergyRule = allergies.length
    ? `HARD SAFETY CONSTRAINT: the user is allergic to: ${allergies.join(", ")}. Never include these or any ingredient, sauce or product derived from them (e.g. milk → butter, ghee, paneer, cheese; gluten → wheat flour, bread, pasta, soy sauce). If unsure about an ingredient, choose a different one.`
    : "";
  return `You are MealMind, a practical home-cooking meal planner. ${allergyRule} Respond with JSON only.`;
}

const responseJsonSchema = z.toJSONSchema(planSchema);

async function callGemini(input: PlanInput, extraNote?: string): Promise<GeneratedPlan> {
  const response = await withRetry(() =>
    gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(input) + (extraNote ? `\n\n${extraNote}` : ""),
      config: {
        systemInstruction: systemInstruction(input.prefs.allergies),
        responseMimeType: "application/json",
        responseJsonSchema,
        temperature: 0.8,
        // A small thinking budget keeps plans coherent without the ~50s latency of unlimited thinking
        thinkingConfig: { thinkingBudget: 1024 },
      },
    })
  );
  let parsed;
  try {
    parsed = planSchema.safeParse(JSON.parse(response.text ?? ""));
  } catch {
    throw new AIError("The AI returned an unreadable plan. Please try again.");
  }
  if (!parsed.success) throw new AIError("The AI returned an unexpected plan. Please try again.");
  return parsed.data;
}

const mealText = (m: Meal) => [m.title, ...m.ingredients.map((i) => i.name)].join(" | ");

/**
 * Generates a plan, then checks it in code: allergens and the user's shopping limit.
 * If either is broken it asks once more with specific feedback. Meals still containing
 * allergens after that keep a visible warning.
 */
export async function generatePlan(input: PlanInput) {
  const allergies = input.prefs.allergies;
  const pantryNames = input.pantry.map((p) => p.name);
  let plan = await callGemini(input);

  const allergenHits = () =>
    plan.days.flatMap((d) => d.meals.map((m) => ({ meal: m, hits: findAllergens(mealText(m), allergies) }))).filter((v) => v.hits.length);
  const tooManyExtras = () => {
    if (input.maxExtraItems == null) return null;
    const extras = extraIngredients(plan.days.flatMap((d) => d.meals), pantryNames);
    return extras.length > input.maxExtraItems ? extras : null;
  };

  const hits = allergenHits();
  const extras = tooManyExtras();
  if (hits.length || extras) {
    const notes: string[] = [];
    if (hits.length) {
      notes.push(`A previous attempt included allergens in: ${hits.map((v) => `"${v.meal.title}" (${v.hits.join(", ")})`).join("; ")}. Do not use these ingredients at all.`);
    }
    if (extras) {
      notes.push(
        input.maxExtraItems === 0
          ? `A previous attempt used ingredients that are NOT in the pantry: ${extras.join(", ")}. Use only pantry items and staples.`
          : `A previous attempt needed ${extras.length} extra ingredients (${extras.join(", ")}), but the user will buy at most ${input.maxExtraItems}. Cut it down.`
      );
    }
    plan = await callGemini(input, `IMPORTANT:\n${notes.join("\n")}`);
  }

  const days = plan.days
    .sort((a, b) => a.day - b.day)
    .map((d) => ({
      day: d.day,
      meals: d.meals.map((m) => ({ ...m, allergyWarnings: findAllergens(mealText(m), allergies) })),
    }));
  return { title: plan.title, days };
}
