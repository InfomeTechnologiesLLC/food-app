import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FoodHistoryPage, Meal, FoodHistoryEntry } from '@/lib/types';
export const useFoodHistory = (date?: string) => useInfiniteQuery({
  queryKey: ['food-history', 'list', date],
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => api<FoodHistoryPage>(`/food-history?${new URLSearchParams({ ...(date ? { date } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
export const useDailyHistory = (date: string) => useQuery({
  queryKey: ['food-history', 'daily', date],
  queryFn: () => api<FoodHistoryPage>(`/food-history?date=${date}&limit=100`),
});
export function useUndoHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/food-history/${id}/undo`, { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['food-history'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['pantry'] });
    },
  });
}
export function historyMeal(entry: FoodHistoryEntry): Meal {
  return { ...entry.meal, _id: entry.mealId, eaten: true, readyToCook: false, missing: [],
    ingredients: entry.meal.ingredients.map((item) => ({ ...item, available: true, have: 0, shortage: 0, unitMismatch: false, incompatibleStock: [] })) };
}
