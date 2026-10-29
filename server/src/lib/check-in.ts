/**
 * Weekly adaptive check-in, in plain deterministic code (never decided by the AI).
 * Once a week it compares the real weight trend with the planned weekly rate and, when the user is
 * clearly off track, moves the calorie target by 150 to 200 kcal and explains why.
 */
import { addDays } from "./calendar.js";

export const CHECK_IN_DAYS = 7;
/** Weigh-ins must cover at least this many days before the trend is trusted. */
export const MIN_SPAN_DAYS = 13;
export const TREND_DAYS = 21;
/** How far (kg/week) the real rate may be from the plan before calories change. */
export const TOLERANCE = 0.15;
export const MAX_ADJUSTMENT = 600;

export interface CheckInInput {
  today: string;
  lastCheckIn: string | null;
  direction: "lose" | "gain" | "maintain";
  /** Planned kg per week, negative when losing */
  plannedRate: number;
  /** Any order */
  weights: { date: string; weightKg: number }[];
  currentAdjustment: number;
}

export type CheckInResult =
  | { due: false }
  | { due: true; deltaKcal: number; actualRate: number | null; reason: string };

const day = (d: string) => new Date(`${d}T00:00:00Z`).getTime() / 86_400_000;
const kg = (n: number) => `${Math.abs(n).toFixed(2)} kg`;

/** kg per week from a least-squares line through the last TREND_DAYS of weigh-ins; null when they cover under MIN_SPAN_DAYS. */
export function trendPerWeek(weights: { date: string; weightKg: number }[], today: string): number | null {
  const from = addDays(today, -TREND_DAYS);
  const pts = weights.filter((w) => w.date > from && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;
  const x = pts.map((p) => day(p.date) - day(pts[0]!.date));
  if (x[x.length - 1]! < MIN_SPAN_DAYS) return null;
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = pts.reduce((a, p) => a + p.weightKg, 0) / pts.length;
  const num = pts.reduce((a, p, i) => a + (x[i]! - mx) * (p.weightKg - my), 0);
  const den = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  return den === 0 ? null : Math.round((num / den) * 7 * 100) / 100;
}

export function checkIn(i: CheckInInput): CheckInResult {
  if (i.lastCheckIn && day(i.today) - day(i.lastCheckIn) < CHECK_IN_DAYS) return { due: false };
  const actual = trendPerWeek(i.weights, i.today);
  if (actual === null) {
    return { due: true, deltaKcal: 0, actualRate: null, reason: "Not enough weigh-ins yet. Log your weight at least once a week for two weeks so the coach can check your progress." };
  }

  let delta = 0;
  let reason: string;
  const planned = i.plannedRate;
  if (i.direction === "gain") {
    if (actual < planned - TOLERANCE) {
      delta = actual <= 0 ? 200 : 150;
      reason = actual <= 0
        ? `Your weight hasn't gone up over the last two weeks (${actual > 0 ? "+" : ""}${actual.toFixed(2)} kg a week, plan ${kg(planned)}). Daily calories go up by ${delta} kcal.`
        : `You are gaining about ${kg(actual)} a week, slower than the planned ${kg(planned)}. Daily calories go up by ${delta} kcal.`;
    } else if (actual > planned + TOLERANCE + 0.1) {
      delta = -150;
      reason = `You are gaining about ${kg(actual)} a week, faster than the planned ${kg(planned)}, which is likely to be mostly fat. Daily calories go down by 150 kcal.`;
    } else reason = `You are gaining about ${kg(actual)} a week, right on plan. Your targets stay the same.`;
  } else if (i.direction === "lose") {
    if (actual > planned + TOLERANCE) {
      delta = actual >= 0 ? -200 : -150;
      reason = actual >= 0
        ? `Your weight hasn't gone down over the last two weeks (${actual > 0 ? "+" : ""}${actual.toFixed(2)} kg a week, plan −${kg(planned)}). Daily calories go down by ${-delta} kcal.`
        : `You are losing about ${kg(actual)} a week, slower than the planned ${kg(planned)}. Daily calories go down by ${-delta} kcal.`;
    } else if (actual < planned - TOLERANCE - 0.1) {
      delta = 150;
      reason = `You are losing about ${kg(actual)} a week, faster than the planned ${kg(planned)}. Losing too fast costs muscle, so daily calories go up by 150 kcal.`;
    } else reason = `You are losing about ${kg(actual)} a week, right on plan. Your targets stay the same.`;
  } else {
    if (Math.abs(actual) > 0.25) {
      delta = actual > 0 ? -150 : 150;
      reason = `Your weight is ${actual > 0 ? "rising" : "falling"} by about ${kg(actual)} a week while your goal is to keep it steady. Daily calories go ${delta > 0 ? "up" : "down"} by 150 kcal.`;
    } else reason = "Your weight is steady, as planned. Your targets stay the same.";
  }

  // Never move further than MAX_ADJUSTMENT from the calculated target in total
  const next = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, i.currentAdjustment + delta));
  if (next !== i.currentAdjustment + delta) {
    delta = next - i.currentAdjustment;
    reason += delta === 0
      ? ` Your calories have already been adjusted by the maximum of ${MAX_ADJUSTMENT} kcal, so please review your goal or talk to a dietitian.`
      : ` (Limited to ${delta > 0 ? "+" : ""}${delta} kcal because the total change is capped at ${MAX_ADJUSTMENT} kcal.)`;
  }
  return { due: true, deltaKcal: delta, actualRate: actual, reason };
}
