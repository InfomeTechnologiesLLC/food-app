import type { User } from '@/lib/types';

/** Remaining scans/plans this month, or null when the plan is unlimited. */
export function remaining(user: User | null, kind: 'scans' | 'plans') {
  if (!user?.limits) return null;
  const limit = kind === 'scans' ? user.limits.scansPerMonth : user.limits.plansPerMonth;
  if (limit == null) return null;
  const used = kind === 'scans' ? user.usage.scansThisMonth : user.usage.plansThisMonth;
  return Math.max(0, limit - used);
}
