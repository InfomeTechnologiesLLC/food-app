import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: ["free", "plus", "family"], default: "free" },
    preferences: {
      diet: { type: String, default: "none" },
      allergies: { type: [String], default: [] },
      goal: { type: String, default: "balanced" },
      budget: { type: String, default: "medium" },
      servings: { type: Number, default: 1 },
    },
    usage: {
      period: { type: String, default: () => new Date().toISOString().slice(0, 7) },
      scansThisMonth: { type: Number, default: 0 },
      plansThisMonth: { type: Number, default: 0 },
    },
    pushTokens: { type: [String], default: [] },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
