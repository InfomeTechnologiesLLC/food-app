import { Schema, model, Types } from "mongoose";

const schema = new Schema({
  adminId: { type: Types.ObjectId, ref: "AdminAccount", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminSession = model("AdminSession", schema);
