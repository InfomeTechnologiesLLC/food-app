import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { PantryIngredient, PantryInput } from '@/lib/types';

const KEY = ['pantry'];

export function usePantry() {
  return useQuery({ queryKey: KEY, queryFn: () => api<PantryIngredient[]>('/pantry') });
}

export function useSavePantryBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ingredientId, batchId, data, requestId }: { ingredientId?: string; batchId?: string; data: PantryInput; requestId?: string }) =>
      ingredientId && batchId
        ? api<PantryIngredient[]>(`/pantry/${ingredientId}/batches/${batchId}`, { method: 'PATCH', body: data })
        : api<PantryIngredient[]>('/pantry', { method: 'POST', body: data, headers: { 'Idempotency-Key': requestId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useDeletePantryBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ingredientId, batchId }: { ingredientId: string; batchId: string }) => api<void>(`/pantry/${ingredientId}/batches/${batchId}`, { method: 'DELETE' }),
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
