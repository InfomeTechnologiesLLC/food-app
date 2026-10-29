import { transaction } from "../db/tx.js";
import { userRepo } from "../repos/users.js";
import { weightRepo } from "../repos/weights.js";
import { targetChangeRepo } from "../repos/target-changes.js";
import { checkIn } from "./check-in.js";
import { targetsForUser } from "./user-targets.js";

export interface CheckInOutcome { ran: boolean; deltaKcal: number; reason: string | null; actualRate: number | null }

/**
 * Runs the weekly check-in for a user when it is due (at most once every 7 days).
 * Needs a complete profile; otherwise nothing happens. Safe to call on every app open.
 */
export async function runWeeklyCheckIn(userId: string, today: string): Promise<CheckInOutcome> {
  return transaction(async (tx) => {
    if (!(await userRepo.lock(userId, tx))) return { ran: false, deltaKcal: 0, reason: null, actualRate: null };
    const user = (await userRepo.findById(userId, tx))!;
    const targets = targetsForUser({ ...user, checkIn: { ...user.checkIn, calorieAdjustment: 0 } });
    if (!targets.ready) return { ran: false, deltaKcal: 0, reason: null, actualRate: null };
    const weights = (await weightRepo.list(userId, 60, tx)).map(({ date, weightKg }) => ({ date, weightKg }));
    const result = checkIn({
      today, lastCheckIn: user.checkIn.lastCheckIn, direction: targets.direction, plannedRate: targets.weeklyRateKg,
      weights, currentAdjustment: user.checkIn.calorieAdjustment,
    });
    if (!result.due) return { ran: false, deltaKcal: 0, reason: null, actualRate: null };
    await targetChangeRepo.record(tx, userId, today, result.deltaKcal, user.checkIn.calorieAdjustment + result.deltaKcal, result.reason);
    return { ran: true, deltaKcal: result.deltaKcal, reason: result.reason, actualRate: result.actualRate };
  });
}
