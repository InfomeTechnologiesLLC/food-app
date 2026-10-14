import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Notifications, notificationsSupported } from '@/lib/notifications';
import { usePantry } from '@/lib/pantry';
import { planReminders } from '@/lib/reminder-schedule';

const CHANNEL_ID = 'expiry';
const SETTINGS_KEY = 'mealmind.reminders';
const KIND = 'expiry-reminder';

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
}

const DEFAULT_SETTINGS: ReminderSettings = { enabled: true, hour: 9 };

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
  settingsCache = raw ? JSON.parse(raw) as ReminderSettings : DEFAULT_SETTINGS;
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

export async function sendTestReminder() {
  if (!Notifications) throw new Error('Reminders need the installed MealMind app. They are not available in Expo Go.');
  if (!(await ensureNotificationPermission())) throw new Error('Notifications are blocked. Enable them in Android settings.');
  await Notifications.scheduleNotificationAsync({
    content: { title: 'MealMind reminders are on 🎉', body: "This is what you'll see when food is about to expire.", data: { url: '/pantry' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
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
