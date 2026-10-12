import { Schema, model, Types } from "mongoose";

const ingredientSchema = new Schema(
  { name: String, quantity: Number, unit: String, fromPantry: Boolean },
  { _id: false }
);

// What marking a meal as made took from the pantry, so unmarking can put it back.
// The item's fields are kept in case the deduction used it up and it was removed.
const consumedSchema = new Schema(
  {
    itemId: Types.ObjectId,
    name: String,
    amount: Number,
    unit: String,
    category: String,
    expiryDate: Date,
    source: String,
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

const mealSchema = new Schema(
  {
    type: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"] },
    title: String,
    description: String,
    prepMinutes: Number,
    calories: { type: Number, required: true, min: 0, validate: Number.isInteger },
    nutrition: { type: nutritionSchema, required: true },
    ingredients: [ingredientSchema],
    steps: [String],
    allergyWarnings: { type: [String], default: [] },
    made: { type: Boolean, default: false },
    madeAt: Date,
    consumed: { type: [consumedSchema], default: [] },
  },
  { _id: false }
);

const shoppingItemSchema = new Schema({
  name: String,
  quantity: Number,
  unit: String,
  checked: { type: Boolean, default: false },
});

const mealPlanSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: String,
    // draft = generated but not added yet; a user has at most one active plan
    status: { type: String, enum: ["draft", "active"], default: "draft", index: true },
    startDate: Date,
    days: [{ day: Number, meals: [mealSchema] }],
    shoppingList: [shoppingItemSchema],
    settingsSnapshot: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const MealPlan = model("MealPlan", mealPlanSchema);
