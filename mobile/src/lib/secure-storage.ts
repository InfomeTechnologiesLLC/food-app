import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key-value storage for the sign-in token and device settings.
 * On Android and iOS this is the phone's encrypted storage (expo-secure-store).
 * expo-secure-store does nothing on web, so the web build uses the browser's localStorage instead
 * (fine for development, but readable by any script on the page). If localStorage is blocked,
 * it behaves like "nothing saved".
 */
const web = Platform.OS === 'web';
const browser = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export async function getItemAsync(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try { return browser()?.getItem(key) ?? null; } catch { return null; }
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try { browser()?.setItem(key, value); } catch { /* storage blocked: kept only for this session */ }
}
export async function deleteItemAsync(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try { browser()?.removeItem(key); } catch { /* nothing to remove */ }
}
