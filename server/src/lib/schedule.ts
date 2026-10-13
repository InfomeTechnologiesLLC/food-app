import mongoose, { type ClientSession } from "mongoose";
import { User } from "../models/User.js";
import { FoodHistory } from "../models/FoodHistory.js";
import { MealPlan } from "../models/MealPlan.js";
import { restoreIngredients } from "./consume.js";
export class ScheduleConflict extends Error {
  constructor(message = "Your plan changed. Refresh and try again.", public status = 409) { super(message); }
}
/** A shared write serializes history and schedule changes, including delete/create races. */
export function scheduleTransaction<T>(userId: string, work: (session: ClientSession) => Promise<T>) {
  return mongoose.connection.transaction(async (session) => {
    const user = await User.findByIdAndUpdate(userId, { $inc: { scheduleRevision: 1 } }, { session });
    if (!user) throw new ScheduleConflict("User not found", 404);
    return work(session);
  });
}
export async function undoEntry(userId: string, entryId: string, session: ClientSession) {
  const entry = await FoodHistory.findOne({ _id: entryId, userId }).select("+consumed").session(session);
  if (!entry) throw new ScheduleConflict("History entry not found", 404);
  if (entry.reversed) return;
  await restoreIngredients(userId, entry.consumed.map((item) => ({ ...item.toObject(), expiryDate: item.expiryDate ?? null })), session);
  entry.reversed = true;
  entry.reversedAt = new Date();
  await entry.save({ session });
  const plan = await MealPlan.findOne({ userId, status: "active", "days.meals._id": entry.mealId }).session(session);
  if (plan) {
    const meal = plan.days.flatMap((day) => day.meals).find((meal) => String(meal._id) === String(entry.mealId));
    if (meal) { meal.eaten = false; meal.historyEntryId = null; }
    await plan.save({ session });
  }
}
