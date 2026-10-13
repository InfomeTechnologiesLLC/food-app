import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: ["free", "plus"], default: "free" },
    preferences: {
      diet: { type: String, default: "none" },
      allergies: { type: [String], default: [] },
      goal: { type: String, default: "balanced" },
      budget: { type: String, default: "medium" },
      heightCm: { type: Number, min: 50, max: 250, default: null },
      weightKg: { type: Number, min: 10, max: 500, default: null },
      weightUpdatedAt: { type: Date, default: null },
    },
    usage: {
      period: { type: String, default: () => new Date().toISOString().slice(0, 7) },
      scansThisMonth: { type: Number, default: 0 },
      plansThisMonth: { type: Number, default: 0 },
    },
    pushTokens: { type: [String], default: [] },
    scheduleRevision: { type: Number, default: 0 },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
