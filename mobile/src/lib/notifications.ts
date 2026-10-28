import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Expo Go on Android (SDK 53+) throws as soon as `expo-notifications` is imported, because the
 * module wires up remote-push token registration on load. Local reminders work fine in a
 * development or release build, so we only load the module there.
 */
// The web build has no local notifications (calls such as getLastNotificationResponse throw), so reminders are off there too
export const notificationsSupported = Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

export const Notifications: NotificationsModule | null = notificationsSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-notifications')
  : null;
