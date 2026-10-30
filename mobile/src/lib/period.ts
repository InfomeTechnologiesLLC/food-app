import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localDate } from '@/lib/plans';
import type { PeriodSettings } from '@/lib/types';

export type Pain = 'none' | 'mild' | 'strong';
export interface PeriodLog { _id: string; startDate: string; endDate: string | null }
export interface PeriodOverview {
  /** Only female profiles can track periods */
  available: boolean;
  settings: PeriodSettings;
  logs: PeriodLog[];
  status: {
    onPeriod: boolean;
    dayOfPeriod: number | null;
    current: PeriodLog | null;
    nextStart: string | null;
    daysUntilNext: number | null;
    averageCycle: number;
    averagePeriod: number;
  };
  pain: Pain | null;
  comfort: { mine: string[]; general: string[] };
}

const key = (userId: string | undefined, today: string) => ['period', userId, today];

/** Period settings, logged periods and today's status. Only fetched when the profile is female. */
export function usePeriod(today = localDate()) {
  const { user } = useAuth();
  return useQuery({
    queryKey: key(user?._id, today),
    enabled: !!user && user.body.sex === 'female',
    queryFn: () => api<PeriodOverview>(`/period?${new URLSearchParams({ today })}`),
  });
}

export function usePeriodActions(today = localDate()) {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const onSuccess = (data: PeriodOverview) => qc.setQueryData(key(user?._id, today), data);
  const refetch = () => qc.invalidateQueries({ queryKey: ['period', user?._id] });
  return {
    settings: useMutation({
      mutationFn: (s: Partial<PeriodSettings>) => api<PeriodSettings>('/period/settings', { method: 'PATCH', body: s }),
      onSuccess: async () => { await refreshUser(); await refetch(); },
    }),
    log: useMutation({
      mutationFn: (b: { startDate: string; endDate?: string | null }) => api<PeriodOverview>('/period/logs', { method: 'POST', body: { ...b, today } }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, ...b }: { id: string; startDate: string; endDate: string | null }) => api<PeriodOverview>(`/period/logs/${id}`, { method: 'PATCH', body: { ...b, today } }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<PeriodOverview>(`/period/logs/${id}?${new URLSearchParams({ today })}`, { method: 'DELETE' }),
      onSuccess,
    }),
    pain: useMutation({
      mutationFn: (pain: Pain) => api<PeriodOverview>(`/period/pain/${today}`, { method: 'PUT', body: { pain } }),
      onSuccess,
    }),
  };
}

/** "in 3 days", "tomorrow", "today", "2 days late" */
export function untilText(days: number) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return `${-days} day${days === -1 ? '' : 's'} late`;
}

/** Logged period days (open periods last the usual length), for skipping rest days in workout tracking. */
export function loggedPeriodDays(p: PeriodOverview | undefined): Set<string> {
  const days = new Set<string>();
  if (!p?.settings.tracking) return days;
  for (const log of p.logs) {
    const start = new Date(`${log.startDate}T12:00:00`);
    const length = log.endDate ? Math.round((Date.parse(`${log.endDate}T12:00:00`) - start.getTime()) / 86_400_000) + 1 : p.status.averagePeriod;
    for (let i = 0; i < Math.min(length, 14); i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      days.add(localDate(d));
    }
  }
  return days;
}
