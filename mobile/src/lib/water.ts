import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { WaterDay } from '@/lib/types';

export const GLASS_ML = 250;
/** The goal depends on weight and activity, so a change to either fetches the day again. */
const key = (body: { weightKg?: number | null; activityLevel?: string | null } | undefined, userId: string | undefined, date: string) =>
  ['water', userId, date, body?.weightKg ?? null, body?.activityLevel ?? null];

/** One day's water: total, goal and each drink (newest last). */
export function useWater(date: string) {
  const { user } = useAuth();
  return useQuery({ queryKey: key(user?.body, user?._id, date), enabled: !!user, queryFn: () => api<WaterDay>(`/me/water/${date}`) });
}

/** Add a drink, or undo one by id. Both return the updated day, which replaces the cached one. */
export function useWaterActions(date: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const onSuccess = (day: WaterDay) => qc.setQueryData(key(user?.body, user?._id, date), day);
  const add = useMutation({ mutationFn: (amountMl: number) => api<WaterDay>(`/me/water/${date}`, { method: 'POST', body: { amountMl } }), onSuccess });
  const undo = useMutation({ mutationFn: (id: string) => api<WaterDay>(`/me/water/entries/${id}`, { method: 'DELETE' }), onSuccess });
  return { add, undo };
}

/** Water per day for a date range, plus the current goal. */
export function useWaterRange(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['water', user?._id, 'range', from, to],
    enabled: !!user,
    queryFn: () => api<{ goalMl: number; days: { date: string; totalMl: number }[] }>(`/me/water?${new URLSearchParams({ from, to })}`),
  });
}

/** "1.25 L" */
export const litres = (ml: number) => `${(ml / 1000).toFixed(ml % 100 === 0 ? 1 : 2)} L`;
