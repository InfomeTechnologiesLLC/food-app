import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExpiryReminderSync } from '@/lib/reminders';
import { remaining } from '@/lib/usage';

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={color as string} size={size} />,
});

/** Header text per tab path; anything unlisted shows the brand name. */
const HEADER_TITLES: Record<string, string> = {
  '/plans': 'Meal plans',
  '/pantry': 'Pantry',
  '/settings': 'Profile',
};

export default function TabsLayout() {
  const theme = useTheme();
  const pathname = usePathname();
  const { user } = useAuth();
  const scansLeft = remaining(user, 'scans');
  useExpiryReminderSync();

  const scansPill = pathname === '/scan' && scansLeft !== null && (
    <Pressable
      onPress={() => router.push('/upgrade')}
      style={[styles.pill, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
        {scansLeft} {scansLeft === 1 ? 'scan' : 'scans'} left
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <AppHeader title={HEADER_TITLES[pathname] ?? 'MealMind'} right={scansPill} />
        </View>
      </SafeAreaView>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.tint,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        }}>
        <Tabs.Screen name="index" options={tab('Home', 'home-outline')} />
        <Tabs.Screen name="scan" options={tab('Scan', 'camera-outline')} />
        <Tabs.Screen name="plans" options={tab('Plans', 'restaurant-outline')} />
        <Tabs.Screen name="pantry" options={tab('Pantry', 'basket-outline')} />
        <Tabs.Screen name="settings" options={tab('Profile', 'person-outline')} />
      </Tabs>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Matches Screen's content padding so the header sits where it did when it lived inside each page
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  pill: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: 10, borderWidth: 1 },
});
