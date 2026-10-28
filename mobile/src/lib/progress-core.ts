/**
 * Pure progress-tracking logic (no React or React Native imports, so it can be unit tested).
 * `useProgress` in progress.ts feeds it with data from the API.
 */
import { dailyProgress } from './daily-progress';
import type { WorkoutSession } from './exercise-types';
import type { MealPlan, NutritionTotals } from './types';

export type RangeDays = 7 | 30;
export type Verdict = 'on_track' | 'behind' | 'off_track' | 'no_plan';
export type DayStatus = 'complete' | 'partial' | 'missed' | 'pending' | 'unplanned';

/** Share of planned items done: at or above ON_TRACK_AT is "on track", at or above BEHIND_AT is "behind". */
export const ON_TRACK_AT = 0.8;
export const BEHIND_AT = 0.5;

/** What was planned on past days of plans that were later replaced or deleted (from GET /me/planned-days). */
export interface PlannedDayRow { kind: 'meal' | 'workout'; date: string; planned: number }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Newest first, ending `today` (YYYY-MM-DD, local calendar date). */
export function lastDates(days: number, today: string) {
  const d = new Date(`${today}T12:00:00`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export function dayStatus(done: number, planned: number, isToday: boolean): DayStatus {
  if (planned === 0) return 'unplanned';
  if (done >= planned) return 'complete';
  if (isToday) return 'pending'; // the day isn't over yet, so it can't count as missed
  return done > 0 ? 'partial' : 'missed';
}

export function verdict(done: number, planned: number): Verdict {
  if (planned === 0) return 'no_plan';
  const share = done / planned;
  return share >= ON_TRACK_AT ? 'on_track' : share >= BEHIND_AT ? 'behind' : 'off_track';
}

interface Counted { done: number; planned: number; status: DayStatus }

/** `days` is newest first. Pending (today, unfinished) and unplanned days don't count against the user. */
export function summarize(days: Counted[]) {
  const counted = days.filter((d) => d.status !== 'pending' && d.status !== 'unplanned');
  const done = counted.reduce((n, d) => n + Math.min(d.done, d.planned), 0);
  const planned = counted.reduce((n, d) => n + d.planned, 0);
  let streak = 0;
  for (const d of days) {
    if (d.status === 'complete') streak++;
    else if (d.status === 'partial' || d.status === 'missed') break;
  }
  return { done, planned, percent: planned ? Math.round((done / planned) * 100) : null, streak, verdict: verdict(done, planned) };
}

/** Rows of one kind as date → planned count. */
export const plannedByDate = (rows: PlannedDayRow[] | undefined, kind: PlannedDayRow['kind']) =>
  Object.fromEntries((rows ?? []).filter((r) => r.kind === kind).map((r) => [r.date, r.planned])) as Record<string, number>;

export interface FoodDay extends Counted { date: string; calories: number }
/**
 * Days covered by the current plan are compared with that plan. Older days use what was saved
 * when their plan was replaced (`saved`), so a new plan doesn't wipe out earlier progress.
 */
export function foodDays(dates: string[], totals: Record<string, NutritionTotals>, plan: MealPlan | undefined, today: string, saved: Record<string, number> = {}): FoodDay[] {
  return dates.map((date) => {
    const p = dailyProgress(plan, totals[date], date);
    const planned = p.hasTarget ? p.totalMeals : saved[date] ?? 0;
    return { date, done: p.eatenMeals, planned, calories: Math.round(p.eaten.calories), status: dayStatus(p.eatenMeals, planned, date === today) };
  });
}

export interface ExerciseDay extends Counted { date: string; sessions: WorkoutSession[]; sets: number }
export const completedSets = (s: WorkoutSession) => s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.status === 'completed').length, 0);
/** `plannedDates` should include both the active plan's training days and saved days of earlier plans. */
export function exerciseDays(dates: string[], sessions: WorkoutSession[], plannedDates: Set<string>, today: string): ExerciseDay[] {
  return dates.map((date) => {
    const done = sessions.filter((s) => s.date === date && completedSets(s) > 0);
    const planned = plannedDates.has(date) ? 1 : 0;
    const d = done.length ? 1 : 0;
    return { date, done: d, planned, sessions: done, sets: done.reduce((n, s) => n + completedSets(s), 0), status: dayStatus(d, planned, date === today) };
  });
}