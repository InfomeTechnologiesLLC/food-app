import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Notifications, notificationsSupported } from '@/lib/notifications';
import { usePantry } from '@/lib/pantry';
import { planActivityReminders, type ActivityReminder } from '@/lib/activity-reminders';
import { daysBetween } from '@/lib/coach';
import { planReminders } from '@/lib/reminder-schedule';
import { useCoach } from '@/lib/use-coach';

const CHANNEL_ID = 'expiry';
const SETTINGS_KEY = 'mealmind.reminders';
const KIND = 'expiry-reminder';
const ACTIVITY_CHANNEL_ID = 'activity';
const ACTIVITY_KINDS = ['meal-reminder', 'workout-reminder', 'weigh-in-reminder'];

export interface ReminderSettings {
  /** Pantry expiry digest */
  enabled: boolean;
  hour: number;
  /** "Did you eat your meals?" on days with a meal plan */
  mealsEnabled: boolean;
  mealHour: number;
  /** "Did you do your workout?" on planned training days */
  workoutEnabled: boolean;
  workoutHour: number;
  /** Weekly weigh-in prompt, on Sundays */
  weighInEnabled: boolean;
  weighInHour: number;
}

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: true, hour: 9, mealsEnabled: true, mealHour: 19, workoutEnabled: true, workoutHour: 18, weighInEnabled: true, weighInHour: 8,
};

// Show reminders even when the app is open
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- Settings (stored on the device; reminders are scheduled per device) -----

let settingsCache: ReminderSettings | null = null;
const listeners = new Set<(s: ReminderSettings) => void>();

async function loadSettings(): Promise<ReminderSettings> {
  if (settingsCache) return settingsCache;
  const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    // Settings saved by older versions lack the newer fields, so fill them from the defaults
  settingsCache = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<ReminderSettings> } : DEFAULT_SETTINGS;
  return settingsCache!;
}

export async function saveReminderSettings(settings: ReminderSettings) {
  settingsCache = settings;
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
  listeners.forEach((fn) => fn(settings));
}

export function useReminderSettings() {
  const [settings, setSettings] = useState<ReminderSettings | null>(settingsCache);
  useEffect(() => {
    loadSettings().then(setSettings);
    listeners.add(setSettings);
    return () => void listeners.delete(setSettings);
  }, []);
  return settings;
}

// --- Permissions ---------------------------------------------------------------

export async function ensureNotificationPermission() {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Expiry reminders',
           importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(ACTIVITY_CHANNEL_ID, {
      name: 'Meal, workout and weigh-in reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// --- Scheduling ----------------------------------------------------------------

async function cancelExpiryReminders() {
  const N = Notifications;
  if (!N) return;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === KIND)
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier))
  );
}

/** Replaces all scheduled expiry reminders with a fresh set for the current pantry. */
export async function syncExpiryReminders(items: { name: string; expiryDate?: string | null }[], settings: ReminderSettings) {
  if (!Notifications) return 0;
  await cancelExpiryReminders();
  if (!settings.enabled) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  const reminders = planReminders(items, settings.hour);
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { kind: KIND, url: '/pantry' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CHANNEL_ID },
    });
  }
  return reminders.length;
}

/** Replaces the scheduled meal, workout and weigh-in reminders with `reminders` (which may be empty). */
export async function syncActivityReminders(reminders: ActivityReminder[]) {
  const N = Notifications;
  if (!N) return 0;
  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => ACTIVITY_KINDS.includes(n.content.data?.kind as string))
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier))
  );
  if (!reminders.length || !(await ensureNotificationPermission())) return 0;
  for (const r of reminders) {
    await N.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { kind: r.kind, url: r.url } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: ACTIVITY_CHANNEL_ID },
    });
  }
  return reminders.length;
}

export async function sendTestReminder() {
  if (!Notifications) throw new Error('Reminders need the installed MealMind app. They are not available in Expo Go.');
  if (!(await ensureNotificationPermission())) throw new Error('Notifications are blocked. Enable them in Android settings.');
  await Notifications.scheduleNotificationAsync({
    content: { title: 'MealMind reminders are on 🎉', body: "This is what you'll see when food is about to expire.", data: { url: '/pantry' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
}

/**
 * Keeps the meal, workout and weigh-in reminders in sync with what the user has already done today.
 * Rebuilt whenever that data changes, so finished items stop reminding. Mount once while signed in.
 * A reminder cannot know about meals or workouts logged on another device until this app next opens.
 */
export function useActivityReminderSync() {
  const settings = useReminderSettings();
  const { series, progress, loading } = useCoach();
  const { today, food, exercise } = progress;
  const lastWeighIn = series.at(-1)?.date;

  // Wait for real data: with nothing loaded yet we would wrongly cancel reminders that are still valid
  const reminders = settings && !loading && !progress.error ? planActivityReminders({
    now: new Date(), today,
    meals: { enabled: settings.mealsEnabled, hour: settings.mealHour, planDates: progress.mealPlanDates, eatenToday: food.days[0]?.done ?? 0, plannedToday: food.days[0]?.planned ?? 0 },
    workout: { enabled: settings.workoutEnabled && exercise.enabled, hour: settings.workoutHour, plannedDates: progress.workoutDates, doneToday: (exercise.days[0]?.done ?? 0) > 0 },
    weighIn: { enabled: settings.weighInEnabled, hour: settings.weighInHour, daysSinceLast: lastWeighIn ? daysBetween(lastWeighIn, today) : null },
  }) : null;
  const signature = reminders?.map((r) => `${r.kind}|${r.date.getTime()}|${r.body}`).join(';');

  useEffect(() => {
    if (!notificationsSupported || !reminders) return;
    syncActivityReminders(reminders).catch((e) => console.warn('activity reminder sync failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

/** Keeps reminders in sync with the pantry. Mount once while the user is signed in. */
export function useExpiryReminderSync() {
  const { data: items } = usePantry();
  const settings = useReminderSettings();

  // Only re-sync when something that affects the schedule changes
  const signature = items?.map((i) => `${i.name}|${i.expiryDate ?? ''}`).sort().join(';');

  useEffect(() => {
    if (!notificationsSupported || !items || !settings) return;
    syncExpiryReminders(items, settings).catch((e) => console.warn('reminder sync failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, settings?.enabled, settings?.hour]);
}
