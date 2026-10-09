import { User } from "../models/User.js";

type Counter = "scansThisMonth" | "plansThisMonth";

// Monthly limits per plan. Infinity = unlimited.
export const LIMITS: Record<string, Record<Counter, number>> = {
  free: { scansThisMonth: 5, plansThisMonth: 3 },
  plus: { scansThisMonth: Infinity, plansThisMonth: Infinity },
  family: { scansThisMonth: Infinity, plansThisMonth: Infinity },
};

export const currentPeriod = () => new Date().toISOString().slice(0, 7); // "2026-10"

/**
 * Atomically consumes one unit of `counter` if the user is under their plan limit.
 * Counters reset when the calendar month changes. Returns false when the limit is reached.
 */
export async function consumeUsage(userId: string, counter: Counter): Promise<boolean> {
  const period = currentPeriod();
  // Reset counters lazily on the first request of a new month
  await User.updateOne(
    { _id: userId, "usage.period": { $ne: period } },
    { $set: { "usage.period": period, "usage.scansThisMonth": 0, "usage.plansThisMonth": 0 } }
  );

  const user = await User.findById(userId).select("plan");
  if (!user) return false;
  const limit = LIMITS[user.plan]?.[counter] ?? 0;

  const filter = Number.isFinite(limit)
    ? { _id: userId, [`usage.${counter}`]: { $lt: limit } }
    : { _id: userId };
  const result = await User.updateOne(filter, { $inc: { [`usage.${counter}`]: 1 } });
  return result.modifiedCount === 1;
}

/** Gives a unit back, e.g. when the AI call fails so the user isn't charged for it. */
export async function refundUsage(userId: string, counter: Counter) {
  await User.updateOne({ _id: userId, [`usage.${counter}`]: { $gt: 0 } }, { $inc: { [`usage.${counter}`]: -1 } });
}

/** User as the app sees it: no password hash, usage reset if it's from an old month, plus the plan's limits. */
export function toPublicUser(user: { toObject: () => any }) {
  const { passwordHash, ...u } = user.toObject();
  const stale = u.usage?.period !== currentPeriod();
  const limits = LIMITS[u.plan] ?? LIMITS.free;
  return {
    ...u,
    usage: stale ? { period: currentPeriod(), scansThisMonth: 0, plansThisMonth: 0 } : u.usage,
    // null = unlimited (Infinity doesn't survive JSON)
    limits: {
      scansPerMonth: Number.isFinite(limits.scansThisMonth) ? limits.scansThisMonth : null,
      plansPerMonth: Number.isFinite(limits.plansThisMonth) ? limits.plansThisMonth : null,
    },
  };
}
