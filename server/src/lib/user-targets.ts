import type { UserDoc } from "../repos/users.js";
import { calculateTargets } from "./targets.js";

/** Today's targets for a user, from their saved profile. Recalculated on every call, so profile edits apply at once. */
export function targetsForUser(user: Pick<UserDoc, "body" | "preferences"> & { checkIn?: UserDoc["checkIn"] }, now = new Date()) {
  const b = user.body;
  return calculateTargets({
    sex: b.sex, birthYear: b.birthYear, heightCm: b.heightCm, weightKg: b.weightKg, targetWeightKg: b.targetWeightKg,
    goal: user.preferences.goal, activityLevel: b.activityLevel, goalWeeks: b.goalWeeks, year: now.getUTCFullYear(),
    adjustmentKcal: user.checkIn?.calorieAdjustment ?? 0,
  });
}
