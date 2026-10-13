import { Schema, model } from "mongoose";
import { PANTRY_CATEGORIES } from "../domain/pantry.js";

const itemSchema = new Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, validate: (value: number) => Number.isFinite(value) && value > 0 },
  unit: { type: String, required: true },
  category: { type: String, enum: PANTRY_CATEGORIES, required: true },
  expiryDate: { type: Date, default: null },
  source: { type: String, enum: ["groceries", "receipt", "manual"], required: true },
}, { _id: false });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  key: { type: String, required: true },
  fingerprint: { type: String, required: true },
  items: { type: [itemSchema], required: true },
  batches: { type: [{ ingredientId: { type: Schema.Types.ObjectId, required: true }, batchId: { type: Schema.Types.ObjectId, required: true } }], required: true },
}, { timestamps: true });
schema.index({ userId: 1, key: 1 }, { unique: true });
export const StockOperation = model("StockOperation", schema);
