import { addDays } from "./calendar.js";

/**
 * Period tracking, worked out in plain code from the periods the user logged.
 *
 * Cycle length: the average gap between the last few period starts (21–45 days count; others
 * are ignored as likely missed logs), or the user's setting until there are two starts.
 * Period length: the average of logged periods with an end day, or the user's setting.
 * General guidance only, not medical advice.
 */

export interface PeriodLog { _id: string; startDate: string; endDate: string | null }
export interface PeriodSettings { cycleLength: number; periodLength: number }

export interface PeriodStatus {
  /** True when today falls inside a logged period */
  onPeriod: boolean;
  /** 1 on the first day of the current period, null when not on a period */
  dayOfPeriod: number | null;
  /** The period covering today, if any */
  current: PeriodLog | null;
  /** Expected start of the next period, null until one period is logged */
  nextStart: string | null;
  /** Days until nextStart (negative when it is late) */
  daysUntilNext: number | null;
  averageCycle: number;
  averagePeriod: number;
}

/** General comfort ideas, always shown with the user's own list. */
export const GENERAL_COMFORT_FOODS = [
  "Warm ginger or cinnamon tea",
  "Iron-rich foods: spinach, lentils, dates, jaggery",
  "Bananas and curd for cramps and digestion",
  "Warm soups, dal or khichdi",
  "Plenty of water and less salt to ease bloating",
];

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const avg = (xs: number[]) => Math.round(xs.reduce((n, x) => n + x, 0) / xs.length);

export function cycleStats(logs: PeriodLog[], settings: PeriodSettings) {
  const starts = [...new Set(logs.map((l) => l.startDate))].sort();
  const gaps = starts.slice(1).map((s, i) => daysBetween(starts[i]!, s)).filter((g) => g >= 21 && g <= 45).slice(-6);
  const lengths = logs.filter((l) => l.endDate).map((l) => daysBetween(l.startDate, l.endDate!) + 1).filter((n) => n >= 1 && n <= 10).slice(-6);
  return { averageCycle: gaps.length ? avg(gaps) : settings.cycleLength, averagePeriod: lengths.length ? avg(lengths) : settings.periodLength };
}

/** The last day of a period: its logged end, or the usual length while it is still open. */
export const periodEnd = (log: PeriodLog, averagePeriod: number) => log.endDate ?? addDays(log.startDate, averagePeriod - 1);

export function periodStatus(logs: PeriodLog[], settings: PeriodSettings, today: string): PeriodStatus {
  const { averageCycle, averagePeriod } = cycleStats(logs, settings);
  const past = logs.filter((l) => l.startDate <= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const last = past.at(-1) ?? null;
  const current = last && today <= periodEnd(last, averagePeriod) ? last : null;
  const nextStart = last ? addDays(last.startDate, averageCycle) : null;
  return {
    onPeriod: !!current,
    dayOfPeriod: current ? daysBetween(current.startDate, today) + 1 : null,
    current,
    nextStart,
    daysUntilNext: nextStart ? daysBetween(today, nextStart) : null,
    averageCycle,
    averagePeriod,
  };
}

/** Dates between `from` and `to` (inclusive) that are logged or expected period days. */
export function periodDaysBetween(logs: PeriodLog[], settings: PeriodSettings, from: string, to: string) {
  const { averageCycle, averagePeriod } = cycleStats(logs, settings);
  const ranges = logs.map((l) => [l.startDate, periodEnd(l, averagePeriod)] as const);
  const last = [...logs].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1);
  if (last) {
    // Expected periods after the last logged one, far enough to cover the range
    for (let start = addDays(last.startDate, averageCycle); start <= to; start = addDays(start, averageCycle)) {
      ranges.push([start, addDays(start, averagePeriod - 1)]);
    }
  }
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (ranges.some(([s, e]) => d >= s && d <= e)) days.push(d);
  return days;
}
