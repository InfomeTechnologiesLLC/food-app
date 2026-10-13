import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/lib/theme-preference';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  const colorScheme = useRNColorScheme();
  const pref = useThemePreference();

  if (hasHydrated) {
    return pref === 'light' || pref === 'dark' ? pref : colorScheme;
  }

  return 'light';
}
