import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useCalendarDate } from '@/hooks/use-calendar-date';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dailyProgress } from '@/lib/daily-progress';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';
import type { WorkoutSession } from '@/lib/exercise-types';
import { useFoodHistory } from '@/lib/history';
import { activePlan, localDate, usePlan, usePlans } from '@/lib/plans';
import type { NutritionTotals } from '@/lib/types';

export type RangeDays = 7 | 30;
export type Verdict = 'on_track' | 'behind' | 'off_track' | 'no_plan';
export type DayStatus = 'complete' | 'partial' | 'missed' | 'pending' | 'unplanned';

/** Share of planned items done: at or above ON_TRACK_AT is "on track", at or above BEHIND_AT is "behind". */
export const ON_TRACK_AT = 0.8;
export const BEHIND_AT = 0.5;

/** Newest first, ending today. */
export function lastDates(days: number, today = localDate()) {
  const d = new Date(`${today}T12:00:00`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(localDate(d));
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

export interface FoodDay extends Counted { date: string; calories: number }
export function foodDays(dates: string[], totals: Record<string, NutritionTotals>, plan: Parameters<typeof dailyProgress>[0], today: string): FoodDay[] {
  return dates.map((date) => {
    const p = dailyProgress(plan, totals[date], date);
    // Without a plan for that date there is nothing to compare the eaten meals against
    const planned = p.hasTarget ? p.totalMeals : 0;
    return { date, done: p.eatenMeals, planned, calories: Math.round(p.eaten.calories), status: dayStatus(p.eatenMeals, planned, date === today) };
  });
}

export interface ExerciseDay extends Counted { date: string; sessions: WorkoutSession[]; sets: number }
export const completedSets = (s: WorkoutSession) => s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.status === 'completed').length, 0);
export function exerciseDays(dates: string[], sessions: WorkoutSession[], plannedDates: Set<string>, today: string): ExerciseDay[] {
  return dates.map((date) => {
    const done = sessions.filter((s) => s.date === date && completedSets(s) > 0);
    const planned = plannedDates.has(date) ? 1 : 0;
    const d = done.length ? 1 : 0;
    return { date, done: d, planned, sessions: done, sets: done.reduce((n, s) => n + completedSets(s), 0), status: dayStatus(d, planned, date === today) };
  });
}

/** Food and exercise tracking for the last `range` days, built from the existing history and plan endpoints. */
export function useProgress(range: RangeDays) {
  const { user } = useAuth();
  const today = useCalendarDate();
  const dates = useMemo(() => lastDates(range, today), [range, today]);
  const start = dates[dates.length - 1]!;

  // Food: page through history until the oldest loaded entry is before the range
  const history = useFoodHistory();
  const foodPages = history.data?.pages ?? [];
  const foodOldest = foodPages.flatMap((p) => p.entries).at(-1)?.date;
  useEffect(() => {
    if (history.hasNextPage && !history.isFetchingNextPage && (!foodOldest || foodOldest >= start)) void history.fetchNextPage();
  }, [history, foodOldest, start]);
  const plans = usePlans();
  const planSummary = plans.data && activePlan(plans.data);
  const plan = usePlan(planSummary?._id);
  const totals = Object.assign({}, ...foodPages.map((p) => p.totals)) as Record<string, NutritionTotals>;
  const food = foodDays(dates, totals, plan.data, today);

  // Exercise: same query key as the Workout history screen, so the cache is shared
  const { sessions: local } = useExercise();
  const sessionPages = useInfiniteQuery({
    queryKey: ['exercise', user?._id, 'history'], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<{ entries: WorkoutSession[]; nextCursor: string | null }>(`/exercise/sessions?${new URLSearchParams(pageParam ? { cursor: pageParam } : {})}`),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const exerciseOldest = sessionPages.data?.pages.flatMap((p) => p.entries).at(-1)?.date;
  useEffect(() => {
    if (sessionPages.hasNextPage && !sessionPages.isFetchingNextPage && (!exerciseOldest || exerciseOldest >= start)) void sessionPages.fetchNextPage();
  }, [sessionPages, exerciseOldest, start]);
  const merged = new Map(sessionPages.data?.pages.flatMap((p) => p.entries).map((s) => [s._id, s]));
  for (const row of local) merged.set(row.session._id, row.session); // unsynced local sessions win
  const workoutPlan = useWorkoutPlans().data?.find((p) => p.status === 'active');
  const plannedDates = new Set(workoutPlan?.days.filter((d) => d.exercises.length > 0).map((d) => d.date));
  const exercise = exerciseDays(dates, [...merged.values()], plannedDates, today);

  return {
    food: { days: food, summary: summarize(food), hasPlan: !!plan.data, eatenTotal: food.reduce((n, d) => n + d.done, 0) },
    exercise: { days: exercise, summary: summarize(exercise), hasPlan: !!workoutPlan, enabled: !!user?.training.enabled, sessionTotal: exercise.reduce((n, d) => n + d.sessions.length, 0) },
    loading: history.isLoading || plans.isLoading || sessionPages.isLoading,
    error: history.error ?? plans.error ?? plan.error,
    refetch: () => { void history.refetch(); void plans.refetch(); void sessionPages.refetch(); },
        refreshing: history.isRefetching || sessionPages.isRefetching,
    today,
    mealPlanDates: plan.data?.days.map((d) => d.date).filter((d): d is string => !!d) ?? [],
    workoutDates: [...plannedDates].filter((d): d is string => !!d),
  };
}