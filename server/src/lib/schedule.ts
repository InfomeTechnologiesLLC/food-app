import type { Conn, Tx } from "../db/client.js";
import { transaction } from "../db/tx.js";
import { userRepo } from "../repos/users.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { mealPlanRepo } from "../repos/meal-plans.js";
import { restoreIngredients } from "./consume.js";
export class ScheduleConflict extends Error {
  constructor(message = "Your plan changed. Refresh and try again.", public status = 409) { super(message); }
}
/** A shared write (the user's row lock) serializes history and schedule changes, including delete/create races. */
export function scheduleTransaction<T>(userId: string, work: (tx: Tx) => Promise<T>) {
  return transaction(async (tx) => {
    if (!(await userRepo.bumpScheduleRevision(userId, tx))) throw new ScheduleConflict("User not found", 404);
    return work(tx);
  });
}
export async function undoEntry(userId: string, entryId: string, tx: Conn) {
  const entry = await foodHistoryRepo.findById(entryId, userId, tx, { withConsumed: true, lock: true });
  if (!entry) throw new ScheduleConflict("History entry not found", 404);
  if (entry.reversed) return;
  await restoreIngredients(userId, entry.consumed ?? [], tx);
  await foodHistoryRepo.markReversed(tx, entry._id);
  const plan = await mealPlanRepo.findActiveContainingMeal(userId, entry.mealId, tx);
  if (plan) await mealPlanRepo.setMealEaten(tx, plan._id, entry.mealId, false, null);
}
