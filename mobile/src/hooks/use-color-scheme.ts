import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/lib/theme-preference';

/** The system scheme, unless the user picked Light or Dark in Settings. */
export function useColorScheme() {
  const system = useRNColorScheme();
  const pref = useThemePreference();
  return pref === 'light' || pref === 'dark' ? pref : system;
}
