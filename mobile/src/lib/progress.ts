import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useCalendarDate } from '@/hooks/use-calendar-date';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';
import type { WorkoutSession } from '@/lib/exercise-types';
import { useFoodHistory } from '@/lib/history';
import { activePlan, usePlan, usePlans } from '@/lib/plans';
import { exerciseDays, foodDays, lastDates, plannedByDate, summarize, type PlannedDayRow, type RangeDays } from '@/lib/progress-core';
import type { NutritionTotals } from '@/lib/types';

// The pure logic lives in progress-core.ts so it can be tested; re-exported for existing imports.
export * from '@/lib/progress-core';

/** Food and exercise tracking for the last `range` days, built from the history, plan and planned-days endpoints. */
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
  const workoutPlans = useWorkoutPlans();
  const workoutPlan = workoutPlans.data?.find((p) => p.status === 'active');

  // Past days of plans that were replaced or deleted. The active plan ids are part of the key,
  // so replacing a plan (which saves the old plan's days) fetches the new rows.
  const saved = useQuery({
    queryKey: ['planned-days', user?._id, start, today, planSummary?._id ?? null, workoutPlan?._id ?? null],
    enabled: !!user,
    queryFn: () => api<PlannedDayRow[]>(`/me/planned-days?${new URLSearchParams({ from: start, to: today })}`),
  });
  const savedMeals = plannedByDate(saved.data, 'meal');
  const savedWorkouts = Object.keys(plannedByDate(saved.data, 'workout'));

  const food = foodDays(dates, totals, plan.data, today, savedMeals);
  const activeWorkoutDates = workoutPlan?.days.filter((d) => d.exercises.length > 0).map((d) => d.date) ?? [];
  // The active plan wins for its own dates; saved rows only fill days it doesn't cover
  const covered = new Set(workoutPlan?.days.map((d) => d.date));
  const plannedDates = new Set([...activeWorkoutDates, ...savedWorkouts.filter((d) => !covered.has(d))]);
  const exercise = exerciseDays(dates, [...merged.values()], plannedDates, today);

  return {
    food: { days: food, summary: summarize(food), hasPlan: !!plan.data, eatenTotal: food.reduce((n, d) => n + d.done, 0) },
    exercise: { days: exercise, summary: summarize(exercise), hasPlan: !!workoutPlan, enabled: !!user?.training.enabled, sessionTotal: exercise.reduce((n, d) => n + d.sessions.length, 0) },
    loading: history.isLoading || plans.isLoading || plan.isLoading || sessionPages.isLoading || saved.isLoading,
    /** Any failed source makes the numbers incomplete, so screens should say so instead of showing them as fact. */
    error: history.error ?? plans.error ?? plan.error ?? sessionPages.error ?? workoutPlans.error ?? saved.error ?? null,
    refetch: () => {
      void history.refetch(); void plans.refetch(); void sessionPages.refetch(); void workoutPlans.refetch(); void saved.refetch();
    },
    refreshing: history.isRefetching || sessionPages.isRefetching || saved.isRefetching,
    today,
    dates,
    /** Food eaten per date (calories, macros, meal count) */
    totals,
    // Reminders only look ahead, so they use the active plans and not the saved past days
    mealPlanDates: plan.data?.days.map((d) => d.date).filter((d): d is string => !!d) ?? [],
    workoutDates: activeWorkoutDates,
  };
}