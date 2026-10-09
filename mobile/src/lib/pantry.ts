import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { PantryInput, PantryItem } from '@/lib/types';

const KEY = ['pantry'];

export function usePantry() {
  return useQuery({ queryKey: KEY, queryFn: () => api<PantryItem[]>('/pantry') });
}

export function useSavePantryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<PantryInput> }) =>
      id
        ? api<PantryItem>(`/pantry/${id}`, { method: 'PATCH', body: data })
        : api<PantryItem>('/pantry', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useDeletePantryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/pantry/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

/** Whole days from today until the expiry date (negative = already expired). */
export function daysUntil(date: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function expiryLabel(date?: string | null) {
  if (!date) return { text: 'No date', level: 'none' as const };
  const d = daysUntil(date);
  if (d < 0) return { text: 'Expired', level: 'danger' as const };
  if (d === 0) return { text: 'Today', level: 'danger' as const };
  if (d === 1) return { text: 'Tomorrow', level: 'danger' as const };
  if (d <= 3) return { text: `${d} days`, level: 'warning' as const };
  return { text: `${d} days`, level: 'ok' as const };
}
