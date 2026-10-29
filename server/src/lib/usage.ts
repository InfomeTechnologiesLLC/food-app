import { userRepo, type Counter, type UserDoc } from "../repos/users.js";

// Monthly limits per plan. Infinity = unlimited.
export const LIMITS: Record<string, Record<Counter, number>> = {
  free: { scansThisMonth: 5, plansThisMonth: 3, coachThisMonth: 40 },
  plus: { scansThisMonth: Infinity, plansThisMonth: Infinity, coachThisMonth: Infinity },
};

export const currentPeriod = () => new Date().toISOString().slice(0, 7); // "2026-10"

/**
 * Atomically consumes one unit of `counter` if the user is under their plan limit.
 * Counters reset when the calendar month changes. Returns false when the limit is reached.
 */
export async function consumeUsage(userId: string, counter: Counter): Promise<boolean> {
  const period = currentPeriod();
  // Reset counters lazily on the first request of a new month
  await userRepo.resetUsageIfStale(userId, period);
  const user = await userRepo.findById(userId);
  if (!user) return false;
  const limit = LIMITS[user.plan]?.[counter] ?? 0;
  return userRepo.incrementUsage(userId, counter, limit);
}

/** Gives a unit back, e.g. when the AI call fails so the user isn't charged for it. */
export async function refundUsage(userId: string, counter: Counter) {
  await userRepo.decrementUsage(userId, counter);
}

/** User as the app sees it: no password hash, usage reset if it's from an old month, plus the plan's limits. */
export function toPublicUser(user: Partial<UserDoc>) {
  const { passwordHash, ...u } = user;
  const stale = u.usage?.period !== currentPeriod();
  const limits = LIMITS[u.plan ?? "free"] ?? LIMITS.free!;
  return {
    ...u,
    usage: stale ? { period: currentPeriod(), scansThisMonth: 0, plansThisMonth: 0, coachThisMonth: 0 } : u.usage,
    // null = unlimited (Infinity doesn't survive JSON)
    limits: {
      scansPerMonth: Number.isFinite(limits.scansThisMonth) ? limits.scansThisMonth : null,
      plansPerMonth: Number.isFinite(limits.plansThisMonth) ? limits.plansThisMonth : null,
      coachPerMonth: Number.isFinite(limits.coachThisMonth) ? limits.coachThisMonth : null,
    },
  };
}
