import { Schema, model, Types } from "mongoose";

export const PANTRY_CATEGORIES = ["produce", "dairy", "meat", "seafood", "grains", "canned", "frozen", "spices", "beverages", "snacks", "other"] as const;

const pantryItemSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: "pcs" },
    category: { type: String, enum: PANTRY_CATEGORIES, default: "other" },
    expiryDate: { type: Date },
    source: { type: String, enum: ["groceries", "receipt", "manual"], default: "manual" },
  },
  { timestamps: true }
);

export const PantryItem = model("PantryItem", pantryItemSchema);
