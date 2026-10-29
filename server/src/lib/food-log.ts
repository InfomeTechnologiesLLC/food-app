import { z } from "zod";
import { newId } from "../db/ids.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { MEAL_TYPES } from "../ai/plan.js";
import { findAllergens } from "./ingredients.js";
import { scheduleTransaction } from "./schedule.js";

/**
 * Food the user ate outside a meal plan (typed, photographed, or chosen from a coach suggestion).
 * It is saved as a normal food history entry, so it counts toward today's targets, shows in
 * Food history, and can be undone there. It takes nothing from the pantry.
 */
export const LOGGED_SOURCE = { photo: "Logged from a photo", text: "Logged by you", coach: "Coach suggestion" } as const;

export const foodLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(MEAL_TYPES),
  title: z.string().trim().min(1).max(120),
  source: z.enum(["photo", "text", "coach"]),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    quantity: z.number().positive().max(10000),
    unit: z.string().trim().min(1).max(20),
    calories: z.number().nonnegative().max(5000),
    proteinGrams: z.number().nonnegative().max(500),
    carbsGrams: z.number().nonnegative().max(1000),
    fatGrams: z.number().nonnegative().max(500),
  })).min(1).max(20),
}).strict();
export type FoodLogInput = z.infer<typeof foodLogSchema>;

export async function logFood(userId: string, input: FoodLogInput, allergies: string[]) {
  const sum = (k: "calories" | "proteinGrams" | "carbsGrams" | "fatGrams") => Math.round(input.items.reduce((n, i) => n + i[k], 0));
  const id = newId();
  await scheduleTransaction(userId, (tx) => foodHistoryRepo.create(tx, {
    _id: id, userId, mealId: newId(), sourcePlanId: "", sourcePlanTitle: LOGGED_SOURCE[input.source], date: input.date, recordedAt: new Date(),
    meal: {
      type: input.mealType, title: input.title, description: input.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", "),
      prepMinutes: 0, calories: sum("calories"),
      nutrition: { proteinGrams: sum("proteinGrams"), carbsGrams: sum("carbsGrams"), fatGrams: sum("fatGrams") },
      ingredients: input.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, fromPantry: false })),
      steps: [],
      allergyWarnings: findAllergens([input.title, ...input.items.map((i) => i.name)].join(" | "), allergies),
    },
    consumed: [],
  }));
  return id;
}
