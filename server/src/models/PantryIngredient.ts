import { Schema, model } from "mongoose";
import { normalize } from "../lib/ingredients.js";
import { PANTRY_CATEGORIES, type IngredientStock } from "../domain/pantry.js";

export const stockBatchSchema = new Schema({
  quantity: { type: Number, required: true, validate: (value: number) => Number.isFinite(value) && value > 0 },
  unit: { type: String, required: true, trim: true },
  expiryDate: { type: Date, default: null },
  source: { type: String, enum: ["groceries", "receipt", "manual"], required: true },
});
const schema = new Schema<IngredientStock>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  key: { type: String, required: true, set: normalize },
  name: { type: String, required: true, trim: true, set: normalize },
  category: { type: String, enum: PANTRY_CATEGORIES, required: true },
  batches: { type: [stockBatchSchema], required: true, validate: (batches: unknown[]) => batches.length > 0 },
}, { timestamps: true, optimisticConcurrency: true });
// Ingredient identity is a database invariant, not a presentation-layer grouping rule.
schema.index({ userId: 1, key: 1 }, { unique: true });
export const PantryIngredient = model<IngredientStock>("PantryIngredient", schema);
