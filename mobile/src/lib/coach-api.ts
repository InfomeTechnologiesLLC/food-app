import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import type * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { readLocal, writeLocal } from '@/lib/local-store';
import { localDate, timezone } from '@/lib/plans';
import { compress } from '@/lib/scan';
import type { CoachAction, CoachMessage, CoachToday, FoodEstimate, MealType, NextMealResult, TargetChange } from '@/lib/types';

/** The phone's date, hour (with minutes as a fraction) and timezone, sent with every coach request. */
export function clock(now = new Date()) {
  return { date: localDate(now), hour: Math.round((now.getHours() + now.getMinutes() / 60) * 100) / 100, timezone: timezone() };
}

/** Today's targets vs intake. Opening it also runs the weekly check-in when it is due. */
export function useCoachToday(date: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['coach-today', user?._id, date],
    enabled: !!user,
    queryFn: async () => {
      const now = clock();
      const today = await api<CoachToday>(`/coach/today?${new URLSearchParams({ date, hour: String(now.hour), timezone: now.timezone })}`);
      // A check-in can change the calorie target
      if (today.checkIn) { void qc.invalidateQueries({ queryKey: ['targets'] }); void qc.invalidateQueries({ queryKey: ['target-changes'] }); }
      return today;
    },
  });
}

export function useTargetChanges() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['target-changes', user?._id], enabled: !!user, queryFn: () => api<TargetChange[]>('/coach/target-changes') });
}

/** Refreshes everything that shows what was eaten today. */
function useAfterFoodChange() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  return () => {
    void qc.invalidateQueries({ queryKey: ['food-history'] });
    void qc.invalidateQueries({ queryKey: ['coach-today'] });
    void refreshUser(); // AI usage counter
  };
}

export function useNextMeal() {
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: (mealType?: MealType) => api<NextMealResult>('/coach/next-meal', { method: 'POST', body: { ...clock(), ...(mealType ? { mealType } : {}) } }),
    onSettled: () => { void refreshUser(); },
  });
}

export function useEstimateFood() {
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: async (input: { text?: string; photo?: ImagePicker.ImagePickerAsset }) => {
      const form = new FormData();
      if (input.text) form.append('text', input.text);
      if (input.photo) {
        const uri = await compress(input.photo);
        // Expo's native fetch needs a real File; the web build uploads a Blob
        if (Platform.OS === 'web') form.append('image', await (await fetch(uri)).blob(), 'plate.jpg');
        else form.append('image', new File(uri) as unknown as Blob, 'plate.jpg');
      }
      return api<FoodEstimate>('/food-log/estimate', { method: 'POST', body: form });
    },
    onSettled: () => { void refreshUser(); },
  });
}

export interface FoodLogInput {
  mealType: MealType;
  title: string;
  source: 'photo' | 'text' | 'coach';
  items: FoodEstimate['items'];
  date?: string;
}
export function useLogFood() {
  const after = useAfterFoodChange();
  return useMutation({
    mutationFn: ({ date = localDate(), ...rest }: FoodLogInput) => api<{ historyEntryId: string }>('/food-log', { method: 'POST', body: { date, ...rest } }),
    onSuccess: after,
  });
}

// ── chat ──

const CHAT_KEY = 'coach-chat';
const KEEP = 40;
/** Messages sent to the server: the newest ones, text only. */
const CONTEXT = 12;

export function loadChat(userId: string): CoachMessage[] {
  try { return readLocal<CoachMessage[]>(userId, CHAT_KEY) ?? []; } catch { return []; }
}
export function saveChat(userId: string, messages: CoachMessage[]) {
  try { writeLocal(userId, CHAT_KEY, messages.slice(-KEEP)); } catch { /* the chat is only a convenience */ }
}

export function useCoachChat() {
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: (history: CoachMessage[]) => {
      const messages = history.filter((m) => !m.error).slice(-CONTEXT).map(({ role, text }) => ({ role, text: text.slice(0, 1500) }));
      // The server needs the conversation to start with the user
      while (messages.length && messages[0]!.role !== 'user') messages.shift();
      return api<{ reply: string; actions: CoachAction[] }>('/coach/chat', { method: 'POST', body: { ...clock(), messages } });
    },
    onSettled: () => { void refreshUser(); },
  });
}
