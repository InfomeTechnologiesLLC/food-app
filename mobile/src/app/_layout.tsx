import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { AlertHost } from '@/components/themed-alert';
import { WorkoutHistoryHeader } from '@/components/workout-history-header';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ExerciseProvider } from "@/lib/exercise";
import { AuthProvider, useAuth } from '@/lib/auth';
import { Notifications } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function RootNavigator() {
  const { user, loading } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Render a themed blank view rather than null so the white native root view never shows
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  return (
    <>
      {Notifications && user?.onboarded && <NotificationTapHandler notifications={Notifications} />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && !user.onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!user?.onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="training-settings" options={{ headerShown: true, title: 'Training preferences' }} />
          <Stack.Screen name="training-plan/[id]" options={{ headerShown: true, title: 'Workout plan' }} />
          <Stack.Screen name="workout/[id]" options={{ headerShown: true, title: 'Workout' }} />
          <Stack.Screen name="workout-history" options={{
            headerShown: true,
            title: 'Workout history',
            ...(Platform.OS === 'android' && { header: () => <WorkoutHistoryHeader /> }),
          }} />
          <Stack.Screen name="reauth" options={{ headerShown: true, title: 'Sign in' }} />
                    <Stack.Screen name="food-history" options={{ headerShown: true, title: 'Food history' }} />
          <Stack.Screen name="progress" options={{ headerShown: true, title: 'Progress & tracking' }} />
          <Stack.Screen name="upgrade" options={{ headerShown: true, title: 'Plans', presentation: 'modal' }} />
          <Stack.Screen
            name="pantry-item"
            options={{ presentation: 'modal', headerShown: true, title: 'Pantry item' }}
          />
          <Stack.Screen name="pantry-ingredient" options={{ headerShown: true, title: 'Pantry ingredient' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Opens the screen a tapped notification points to (also after a cold start). */
function NotificationTapHandler({ notifications }: { notifications: NonNullable<typeof Notifications> }) {
  const last = notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string') {
      router.navigate(url as '/pantry');
      notifications.clearLastNotificationResponse();
    }
  }, [last, notifications]);
  return null;
}

export default function RootLayout() {
  const theme = useTheme();
  const isDark = theme === Colors.dark;

  // The native root view defaults to white; match it to the app so transitions don't flash
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background);
  }, [theme.background]);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.border,
      primary: theme.tint,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ExerciseProvider><RootNavigator /></ExerciseProvider>
          <AlertHost />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
