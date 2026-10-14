import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { BmiCard } from '@/components/bmi-card';
import { DailyProgressCard } from '@/components/daily-progress-card';
import { ExerciseProgressCard } from '@/components/exercise-progress-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { daysUntil, usePantry } from '@/lib/pantry';
import { activePlan, usePlan, usePlans } from '@/lib/plans';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { useDailyHistory } from '@/lib/history';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';
import { remaining } from '@/lib/usage';

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

function StatTile({ value, label, icon, iconColor, href, urgent = false }: {
  value: number | string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  href: Href;
  urgent?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.navigate(href)}
      style={({ pressed }) => [styles.tile, styles.statTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={[styles.statValue, urgent && { color: theme.danger }]}>{value}</ThemedText>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <ThemedText type="small" themeColor={urgent ? undefined : 'textSecondary'} style={[{ fontSize: 12 }, urgent && { color: theme.danger }]}>{label}</ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const date = useCalendarDate();
  const { user } = useAuth();
  const { data: items = [], isLoading, refetch, isRefetching } = usePantry();
  const { data: plans = [], refetch: refetchPlans, isLoading: plansLoading, error: plansError, isRefetching: plansRefetching } = usePlans();
  const history = useDailyHistory(date);
  const workouts = useWorkoutPlans();
  const { sync: syncWorkouts, syncing: workoutsSyncing } = useExercise();
  const latest = activePlan(plans);
  const { data: currentPlan, isLoading: planLoading, error: planError, refetch: refetchPlan, isRefetching: planRefetching } = usePlan(latest?._id);
  const refresh = () => {
    refetch();
    history.refetch();
    refetchPlans();
    void workouts.refetch();
    void syncWorkouts();
    if (latest) refetchPlan();
  };
  const scansLeft = remaining(user, 'scans');
  const expiredCount = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate) < 0).length;
  const expiringSoonCount = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate) >= 0 && daysUntil(i.expiryDate) <= 3).length;
  const hasExpiredItems = expiredCount > 0;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={isRefetching || plansRefetching || planRefetching || history.isRefetching || workouts.isRefetching || workoutsSyncing} onRefresh={refresh} />}>
      <View style={{ gap: Spacing.one, paddingTop: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">{dateLabel}</ThemedText>
        <ThemedText type="subtitle">
          {"What’s "}<ThemedText type="subtitle" themeColor="tint">cooking?</ThemedText>
        </ThemedText>
      </View>

      <View style={[styles.row, { gap: Spacing.two, alignItems: 'stretch' }]}>
        <Pressable
          onPress={() => router.navigate('/pantry')}
          style={({ pressed }) => [styles.tile, styles.heroTile, { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
          <View style={styles.rowBetween}>
            <ThemedText style={[styles.eyebrow, { color: theme.tintText }]}>YOUR PANTRY</ThemedText>
            <Ionicons name="basket-outline" size={20} color={theme.tintText} />
          </View>
          <ThemedText style={[styles.heroValue, { color: theme.tintText }]}>{isLoading ? '–' : items.length}</ThemedText>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="small" style={{ color: theme.tintText }}>{plural(items.length, 'item')} tracked</ThemedText>
            <Ionicons style={{ alignSelf: 'flex-end' }} name="arrow-forward" size={22} color={theme.tintText} />
          </View>
        </Pressable>

        <View style={{ flex: 1, gap: Spacing.two }}>
          <StatTile
            value={hasExpiredItems ? expiredCount : expiringSoonCount}
            label={hasExpiredItems ? `${plural(expiredCount, 'Item')} expired` : `${plural(expiringSoonCount, 'Item')} to use soon`}
            icon={hasExpiredItems ? 'alert-circle-outline' : 'time-outline'}
            iconColor={hasExpiredItems ? theme.danger : theme.warning}
            href="/pantry"
            urgent={hasExpiredItems}
          />
          <BmiCard />
        </View>
      </View>

      <View style={{ gap: Spacing.two }}>
        <View style={[styles.row, { gap: Spacing.two }]}>
          <Pressable
            onPress={() => router.navigate('/scan')}
            style={({ pressed }) => [styles.action, { flex: 1, gap: Spacing.two, backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="scan-outline" size={20} color={theme.tintText} />
            <ThemedText style={{ color: theme.tintText, fontWeight: 600 }}>Scan groceries or receipt</ThemedText>
          </Pressable>
          <Pressable
            accessibilityLabel="Add item manually"
            onPress={() => router.push('/pantry-item')}
            style={({ pressed }) => [styles.action, { width: 50, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="add" size={26} color={theme.text} />
          </Pressable>
        </View>
        {scansLeft !== null && (
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
            {scansLeft} free {plural(scansLeft, 'scan')} left this month
          </ThemedText>
        )}
      </View>

      <DailyProgressCard
        date={date}
        plan={currentPlan}
        history={history.data?.totals[date]}
        loading={plansLoading || planLoading || history.isLoading}
        error={plansError ?? planError ?? history.error}
        onRetry={refresh}
      />
      <ExerciseProgressCard date={date} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tile: { borderRadius: 20, padding: Spacing.three },
  heroTile: { flex: 1, justifyContent: 'space-between', minHeight: 176 },
  statTile: { flex: 1, borderWidth: 1, justifyContent: 'space-between', gap: Spacing.two },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  heroValue: { fontSize: 56, lineHeight: 64, fontWeight: 700 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: 600, letterSpacing: 1.2 },
  action: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
