import { Schema, model, Types } from "mongoose";
import { mealSchema, consumedSchema } from "./MealPlan.js";
const schema = new Schema({
  userId: { type: Types.ObjectId, required: true },
  mealId: { type: Types.ObjectId, required: true },
  sourcePlanId: { type: Types.ObjectId, required: true },
  sourcePlanTitle: { type: String, required: true },
  date: { type: String, required: true },
  recordedAt: { type: Date, required: true },
  reversed: { type: Boolean, default: false, required: true },
  reversedAt: Date,
  meal: { type: mealSchema, required: true },
  consumed: { type: [consumedSchema], default: [], select: false },
});
schema.index({ userId: 1, mealId: 1 }, { unique: true, partialFilterExpression: { reversed: false } });
schema.index({ userId: 1, reversed: 1, date: -1, _id: -1 });
export const FoodHistory = model("FoodHistory", schema);
