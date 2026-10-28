import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { readLocal, writeLocal } from '@/lib/local-store';
import { Notifications } from '@/lib/notifications';

const KEY = 'tutorial-seen';

/** On web the local store only lives in memory, so use the browser's storage there (it may be blocked). */
function webStorage() {
  try { return Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Remembered on this device, per account. */
export function hasSeenTutorial(userId: string) {
  const web = webStorage();
  if (web) {
    try { return web.getItem(`${KEY}:${userId}`) === '1'; } catch { return false; }
  }
  return readLocal<boolean>(userId, KEY) === true;
}
export function markTutorialSeen(userId: string) {
  const web = webStorage();
  if (web) {
    try { web.setItem(`${KEY}:${userId}`, '1'); } catch { /* storage blocked: the tutorial shows again next time */ }
    return;
  }
  writeLocal(userId, KEY, true);
}

/** True when the app was opened by tapping a reminder, which should take the user straight to its screen. */
const openedFromNotification = () => {
  try { return typeof Notifications?.getLastNotificationResponse()?.notification.request.content.data?.url === 'string'; } catch { return false; }
};

/**
 * Opens the tutorial once for an account that has finished onboarding. Mount in the tabs layout.
 * Skipped when the app was opened from a notification; it then shows on the next normal open.
 */
export function useFirstLoginTutorial() {
  const { user } = useAuth();
  const id = user?.onboarded ? user._id : null;
  useEffect(() => {
    if (id && !hasSeenTutorial(id) && !openedFromNotification()) router.push('/tutorial');
  }, [id]);
}