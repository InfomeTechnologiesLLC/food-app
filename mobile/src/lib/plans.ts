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
  return useMutation({
    mutationFn: (body: { days: number; mealTypes: MealType[]; maxExtraItems: number | null }) => api<MealPlan & { previewToken: string }>('/plans', { method: 'POST', body }),
  });
}

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const today = () => localDate();
export const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export function planDayDate(startDate: string, day: number) {
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + day - 1);
  return d;
}
export const dayLabel = (date: string | undefined, day: number) => date ? `Day ${day} · ${dateLabel(date)}` : `Day ${day}`;
export interface PlanTarget { activeId: string | null; revision: number | null }
export const planTarget = (plan?: MealPlan | MealPlanSummary): PlanTarget => ({ activeId: plan?._id ?? null, revision: plan?.__v ?? null });

/** Changes to the current plan: they return it, and can change the pantry and the plans list. */
function usePlanChange<V>(fn: (vars: V) => Promise<MealPlan>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['pantry'] });
      qc.invalidateQueries({ queryKey: ['food-history'] });
    },
    onSuccess: (plan) => {
      qc.setQueryData(['plans', plan._id], plan);
    },
  });
}

export const useReplacePlan = () =>
  usePlanChange(({ previewToken, target }: { previewToken: string; target: PlanTarget }) => api<MealPlan>('/plans/replace', { method: 'POST', body: { previewToken, ...target, timezone: timezone() } }));
/** Replaces one meal with a new one that follows the user's request; `remember` saves `avoid` as disliked foods. */
export const useChangeMeal = (planId: string) =>
  usePlanChange(({ mealId, request, avoid, remember, revision }: { mealId: string; request: string; avoid: string[]; remember: boolean; revision: number }) =>
    api<MealPlan>(`/plans/${planId}/meals/${mealId}/change`, { method: 'POST', body: { request, avoid, remember, revision, timezone: timezone() } }));
export const useMarkEaten = (planId: string) =>
  usePlanChange(async ({ mealId, historyEntryId, eaten, confirm, revision }: { mealId: string; historyEntryId: string | null; eaten: boolean; confirm?: boolean; revision: number }) => {
    if (!eaten) {
      await api<void>(`/food-history/${historyEntryId}/undo`, { method: 'POST' });
      return api<MealPlan>(`/plans/${planId}`);
    }
    return api<MealPlan>(`/plans/${planId}/meals/${mealId}/eaten`, { method: 'POST', body: { confirm, revision, timezone: timezone() } });
  });

export const activePlan = (plans: MealPlanSummary[]) => plans.find((p) => p.status === 'active');

/** Record a purchase and remove its requirement optimistically; restore on failure. */
export function usePurchaseShoppingItem(planId: string) {
  const qc = useQueryClient();
  const key = ['plans', planId];
  return useMutation({
    mutationFn: ({ itemId }: { itemId: string }) =>
      api<void>(`/plans/${planId}/purchases/${itemId}`, { method: 'POST' }),
    onMutate: async ({ itemId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MealPlan>(key);
      qc.setQueryData<MealPlan>(key, (p) =>
        p && { ...p, shoppingList: p.shoppingList.filter((i) => i._id !== itemId) }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['pantry'] });
      qc.invalidateQueries({ queryKey: ['food-history'] });
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
