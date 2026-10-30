import { useIsMutating, useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkoutPlans } from '@/lib/exercise';
import type { WorkoutPlan } from '@/lib/exercise-types';
import { activePlan, localDate, timezone, usePlan, usePlans } from '@/lib/plans';
import type { MealPlan } from '@/lib/types';

/**
 * The coach plans the week by itself: meals (7 days, 4 meals a day) and workouts (7 days for the
 * user's goal), as soon as the user opens Today, Meals or Exercise and there is nothing for today.
 * Each runs at most once per app session; after a failure the screen offers "Try again".
 */
const MEALS_KEY = ['auto-week', 'meals'];
const WORKOUTS_KEY = ['auto-week', 'workouts'];
const tried = { meals: new Set<string>(), workouts: new Set<string>() };

/** The latest error of a keyed mutation, from whichever screen ran it. */
function useLastError(key: string[]) {
  const states = useMutationState({ filters: { mutationKey: key }, select: (m) => ({ status: m.state.status, error: m.state.error }) });
  const last = states.at(-1);
  return last?.status === 'error' ? (last.error as Error) : null;
}

export function useAutoMealWeek() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const plans = usePlans();
  const current = plans.data ? activePlan(plans.data) : undefined;
  const meals = usePlan(current?._id);
  const today = localDate();
  const needed = !!user && !!plans.data && !plans.error && (!current || (!!meals.data && meals.data.days.every((d) => !d.date || d.date < today)));
  const mutation = useMutation({
    mutationKey: MEALS_KEY,
    mutationFn: () => api<MealPlan>('/plans/auto', { method: 'POST', body: { timezone: timezone() }, timeoutMs: 180000 }),
    onSuccess: (plan) => qc.setQueryData(['plans', plan._id], plan),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['plans'] }); void qc.invalidateQueries({ queryKey: ['pantry'] }); },
  });
  const running = useIsMutating({ mutationKey: MEALS_KEY }) > 0;
  const lastError = useLastError(MEALS_KEY);
  const { mutate } = mutation;
  useEffect(() => {
    if (!needed || !user || tried.meals.has(user._id)) return;
    tried.meals.add(user._id);
    mutate();
  }, [needed, user, mutate]);
  return { planning: running, needed, error: needed && !running ? lastError : null, retry: () => mutate() };
}

export function useAutoWorkoutWeek() {
  const { user, needsSignIn } = useAuth();
  const qc = useQueryClient();
  const plans = useWorkoutPlans();
  const today = localDate();
  const active = plans.data?.find((p) => p.status === 'active');
  const ended = !!active && active.days.every((d) => d.date < today);
  // Waits until the user has picked their exercise days
  const needed = !!user?.training.enabled && !!user.trainingDaysChosen && !!plans.data && !plans.isError && (!active || ended) && !needsSignIn;
  const mutation = useMutation({
    mutationKey: WORKOUTS_KEY,
    /** `replace`: plan a new week even if one is running (after the user changed their exercise days) */
    mutationFn: async (replace?: boolean) => {
      const latest = (await api<WorkoutPlan[]>('/exercise/plans')).find((p) => p.status === 'active');
      if (!replace && latest && latest.days.some((d) => d.date >= localDate())) return latest; // planned elsewhere meanwhile
      const draft = await api<WorkoutPlan>('/exercise/plans', { method: 'POST', body: { timezone: timezone(), startDate: localDate() } });
      return api<WorkoutPlan>(`/exercise/plans/${draft._id}/activate`, { method: 'POST', body: { revision: draft.__v, activeId: latest?._id ?? null, activeRevision: latest?.__v ?? null } });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] }),
  });
  const running = useIsMutating({ mutationKey: WORKOUTS_KEY }) > 0;
  const lastError = useLastError(WORKOUTS_KEY);
  const { mutate } = mutation;
  useEffect(() => {
    if (!needed || !user || tried.workouts.has(user._id)) return;
    tried.workouts.add(user._id);
    mutate(false);
  }, [needed, user, mutate]);
  /** For screens that plan the week themselves (e.g. after switching exercise on) */
  const markTried = () => { if (user) tried.workouts.add(user._id); };
  return { planning: running, needed, error: needed && !running ? lastError : null, retry: () => mutate(false), replan: () => mutate(true), markTried };
}
