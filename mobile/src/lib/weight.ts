import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localDate } from '@/lib/plans';

export interface WeightEntry { date: string; weightKg: number }

/** Weigh-ins, newest first. One per day; logging a day again replaces it. */
export function useWeights() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['weights', user?._id], enabled: !!user, queryFn: () => api<WeightEntry[]>('/me/weights') });
}

export function useLogWeight() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: ({ weightKg, date = localDate() }: { weightKg: number; date?: string }) =>
      api<WeightEntry>(`/me/weights/${date}`, { method: 'PUT', body: { weightKg } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['weights'] });
      await refreshUser(); // the newest weigh-in is also the profile's current weight (BMI card)
    },
  });
}

/** Oldest first. With no weigh-ins yet, the weight saved on the profile counts as the first point. */
export function weightSeries(logs: WeightEntry[] | undefined, current?: number | null, updatedAt?: string | null): WeightEntry[] {
  if (logs?.length) return [...logs].sort((a, b) => a.date.localeCompare(b.date));
  return current && updatedAt ? [{ date: localDate(new Date(updatedAt)), weightKg: current }] : [];
}
