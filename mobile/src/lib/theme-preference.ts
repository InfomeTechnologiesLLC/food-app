import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';

const KEY = 'mealmind.theme';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

// Stored on the device, like reminder settings: each phone can look different
let cache: ThemePreference | null = null;
const listeners = new Set<(p: ThemePreference) => void>();

/** Makes native UI (status bar, system dialogs, keyboard) follow the chosen theme too. */
function apply(pref: ThemePreference) {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

async function load(): Promise<ThemePreference> {
  if (cache) return cache;
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  cache = THEME_PREFERENCES.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system';
  apply(cache);
  return cache;
}

export async function saveThemePreference(pref: ThemePreference) {
  cache = pref;
  apply(pref);
  listeners.forEach((fn) => fn(pref));
  await SecureStore.setItemAsync(KEY, pref).catch(() => {});
}

export function useThemePreference() {
  const [pref, setPref] = useState<ThemePreference | null>(cache);
  useEffect(() => {
    load().then(setPref);
    listeners.add(setPref);
    return () => void listeners.delete(setPref);
  }, []);
  return pref;
}
