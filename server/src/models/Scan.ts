import { Schema, model, Types } from "mongoose";

const scanSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["groceries", "receipt"], required: true },
    // Raw AI output kept for debugging and for measuring how much users edit it
    aiItems: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ["pending_review", "confirmed"], default: "pending_review" },
    confirmedCount: { type: Number },
  },
  { timestamps: true }
);

export const Scan = model("Scan", scanSchema);
