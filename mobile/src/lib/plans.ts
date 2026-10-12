import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { MealPlan, MealPlanSummary, MealType } from '@/lib/types';

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: () => api<MealPlanSummary[]>('/plans') });
}

export function usePlan(id: string | undefined) {
  return useQuery({ queryKey: ['plans', id], queryFn: () => api<MealPlan>(`/plans/${id}`), enabled: !!id });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { days: number; mealTypes: MealType[]; maxExtraItems: number | null }) => api<MealPlan>('/plans', { method: 'POST', body }),
    onSuccess: (plan) => {
      qc.setQueryData(['plans', plan._id], plan);
      qc.invalidateQueries({ queryKey: ['plans'], exact: true });
    },
  });
}

/** Local midnight today, so the server numbers plan days by the user's calendar. */
export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Calendar date of a plan day (day 1 = start date). */
export function planDayDate(startDate: string, day: number) {
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + day - 1);
  return d;
}

export const isUpcoming = (startDate: string, day: number) => planDayDate(startDate, day) > today();

export const dayLabel = (startDate: string | undefined, day: number) =>
  startDate
    ? `Day ${day} · ${planDayDate(startDate, day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : `Day ${day}`;

/** Changes to the current plan: they return it, and can change the pantry and the plans list. */
function usePlanChange<V>(fn: (vars: V) => Promise<MealPlan>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (plan) => {
      qc.setQueryData(['plans', plan._id], plan);
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['pantry'] });
    },
  });
}

/** Makes a draft the current plan, replacing the existing one. */
export const useActivatePlan = () =>
  usePlanChange((id: string) => api<MealPlan>(`/plans/${id}/activate`, { method: 'POST', body: { today: today() } }));

/** Adds the chosen days of a draft to the end of the current plan. */
export const useMergePlan = () =>
  usePlanChange(({ id, days }: { id: string; days: number[] }) =>
    api<MealPlan>(`/plans/${id}/merge`, { method: 'POST', body: { days, today: today() } }));

/** Swaps an upcoming day of the current plan for a day of a draft. */
export const useReplaceDay = () =>
  usePlanChange(({ id, fromDay, toDay }: { id: string; fromDay: number; toDay: number }) =>
    api<MealPlan>(`/plans/${id}/replace-day`, { method: 'POST', body: { fromDay, toDay, today: today() } }));

/**
 * Marks a meal as made (takes its ingredients out of the pantry) or not made (puts them back).
 * Fails with code SHORTAGE (error.data.shortages) when the pantry is short and confirm isn't set.
 */
export const useMarkMade = (planId: string) =>
  usePlanChange((body: { day: number; index: number; made: boolean; confirm?: boolean }) =>
    api<MealPlan>(`/plans/${planId}/meals/made`, { method: 'POST', body }));

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'], exact: true }),
  });
}

export const activePlan = (plans: MealPlanSummary[]) => plans.find((p) => p.status === 'active');

/** Ticks a shopping item instantly, then syncs with the server (rolls back on failure). */
export function useToggleShoppingItem(planId: string) {
  const qc = useQueryClient();
  const key = ['plans', planId];
  return useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api<void>(`/plans/${planId}/shopping/${itemId}`, { method: 'PATCH', body: { checked } }),
    onMutate: async ({ itemId, checked }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MealPlan>(key);
      qc.setQueryData<MealPlan>(key, (p) =>
        p && { ...p, shoppingList: p.shoppingList.map((i) => (i._id === itemId ? { ...i, checked } : i)) }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['pantry'] });
    },
  });
}

export { formatQty } from '@/lib/quantities';

export const SHOPPING_OPTIONS = [0, 3, 5, 10, null] as const;
export type ShoppingOption = (typeof SHOPPING_OPTIONS)[number];

export const shoppingLabel = (max: number | null | undefined) =>
  max === 0 ? 'Pantry only' : max == null ? 'No limit' : `Up to ${max}`;

export const shoppingHint = (max: number | null) =>
  max === 0
    ? "Meals use only what's in your pantry plus basics like salt, oil and spices."
    : max == null
      ? 'Buy whatever makes the meals best. Extras are added to your shopping list.'
      : `You'll need to buy at most ${max} extra ingredient${max === 1 ? '' : 's'}. Each one is reused across meals.`;
