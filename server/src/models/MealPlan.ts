import { Schema, model, Types, type InferSchemaType } from "mongoose";

import { PANTRY_CATEGORIES } from "../domain/pantry.js";

const ingredientSchema = new Schema(
  { name: { type: String, required: true }, quantity: { type: Number, required: true, min: Number.MIN_VALUE }, unit: { type: String, required: true }, fromPantry: { type: Boolean, required: true } },
  { _id: false }
);

// What marking a meal as eaten took from the pantry, so unmarking can put it back.
// Batch metadata is domain history for undo, even after the batch is exhausted.
export const consumedSchema = new Schema(
  {
    ingredientKey: { type: String, required: true },
    batchId: { type: Types.ObjectId, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: Number.MIN_VALUE },
    unit: { type: String, required: true },
    category: { type: String, enum: PANTRY_CATEGORIES, required: true },
    expiryDate: { type: Date, default: null },
    source: { type: String, enum: ["groceries", "receipt", "manual"], required: true },
  },
  { _id: false }
);

const nutritionSchema = new Schema(
  {
    proteinGrams: { type: Number, required: true, min: 0, validate: Number.isFinite },
    carbsGrams: { type: Number, required: true, min: 0, validate: Number.isFinite },
    fatGrams: { type: Number, required: true, min: 0, validate: Number.isFinite },
  },
  { _id: false }
);

export const mealSchema = new Schema(
  {
    type: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    prepMinutes: { type: Number, required: true, min: 0 },
    calories: { type: Number, required: true, min: 0, validate: Number.isInteger },
    nutrition: { type: nutritionSchema, required: true },
    ingredients: [ingredientSchema],
    steps: [String],
    allergyWarnings: { type: [String], default: [] },
    eaten: { type: Boolean, default: false },
    historyEntryId: { type: Types.ObjectId, default: null },
  },
  { _id: true }
);

const mealPlanSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    // draft = generated but not added yet; a user has at most one active plan
    status: { type: String, enum: ["draft", "active"], default: "draft", index: true },
    startDate: String,
    days: [{ day: { type: Number, required: true, min: 1 }, date: String, meals: [mealSchema] }],
    settingsSnapshot: { type: new Schema({
      diet: { type: String, required: true },
      allergies: { type: [String], required: true },
      goal: { type: String, required: true },
      budget: { type: String, required: true },
      heightCm: { type: Number, default: null },
      weightKg: { type: Number, default: null },
      weightUpdatedAt: { type: Date, default: null },
      mealTypes: { type: [String], required: true },
      maxExtraItems: { type: Number, default: null },
    }, { _id: false }), required: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

mealPlanSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

export const MealPlan = model("MealPlan", mealPlanSchema);

export type PlanData = InferSchemaType<typeof mealPlanSchema>;
