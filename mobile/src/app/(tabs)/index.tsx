import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { PeriodCard } from '@/components/period-card';
import { TargetsCard } from '@/components/targets-card';
import { useCoachToday } from '@/lib/coach-api';
import { useAutoMealWeek, useAutoWorkoutWeek } from '@/lib/auto-week';
import { WaterCard } from '@/components/water-card';
import { TodayOverview } from '@/components/today-overview';
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
      style={({ pressed }) => [styles.tile, styles.statTile, { backgroundColor: theme.background, opacity: pressed ? 0.8 : 1 }]}>
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
  const qc = useQueryClient();
  // Runs the weekly check-in when it is due (the result shows on the targets card)
  useCoachToday(date);
  // The coach plans this week's meals and workouts as soon as the app opens
  useAutoMealWeek();
  useAutoWorkoutWeek();
  const { data: items = [], isLoading, refetch, isRefetching } = usePantry();
  const { data: plans = [], refetch: refetchPlans, isLoading: plansLoading, isRefetching: plansRefetching } = usePlans();
  const history = useDailyHistory(date);
  const workouts = useWorkoutPlans();
  const { sync: syncWorkouts, syncing: workoutsSyncing } = useExercise();
  const latest = activePlan(plans);
  const { data: currentPlan, isLoading: planLoading, refetch: refetchPlan, isRefetching: planRefetching } = usePlan(latest?._id);
  const refresh = () => {
    refetch();
    history.refetch();
    refetchPlans();
    void workouts.refetch();
    void syncWorkouts();
    if (latest) refetchPlan();
    void qc.invalidateQueries({ queryKey: ['targets'] });
    void qc.invalidateQueries({ queryKey: ['water'] });
    void qc.invalidateQueries({ queryKey: ['coach-today'] });
  };
  const scansLeft = remaining(user, 'scans');
  const expiredCount = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate) < 0).length;
  const expiringSoonCount = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate) >= 0 && daysUntil(i.expiryDate) <= 3).length;
  const hasExpiredItems = expiredCount > 0;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={isRefetching || plansRefetching || planRefetching || history.isRefetching || workouts.isRefetching || workoutsSyncing} onRefresh={refresh} />}>
      {/* An overview of the day's targets: goal first, then food and water, the pantry last */}
      <ThemedText type="small" themeColor="textSecondary" style={{ paddingTop: Spacing.two }}>{dateLabel}</ThemedText>
      <TodayOverview />
      <TargetsCard date={date} plan={currentPlan} history={history.data?.totals[date]} loading={plansLoading || planLoading || history.isLoading} />
      <WaterCard date={date} />

      <PeriodCard date={date} />

      {/* Pantry, in the same card style as the others */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Pantry</ThemedText>
          <Ionicons name="basket-outline" size={20} color={theme.tint} />
        </View>
        <View style={[styles.row, { gap: Spacing.two }]}>
          <StatTile value={isLoading ? '–' : items.length} label={`${plural(items.length, 'item')} at home`} icon="basket-outline" iconColor={theme.tint} href="/pantry" />
          <StatTile
            value={hasExpiredItems ? expiredCount : expiringSoonCount}
            label={hasExpiredItems ? `${plural(expiredCount, 'item')} expired` : 'to use soon'}
            icon={hasExpiredItems ? 'alert-circle-outline' : 'time-outline'}
            iconColor={hasExpiredItems ? theme.danger : theme.warning}
            href="/pantry"
            urgent={hasExpiredItems}
          />
        </View>
        <View style={[styles.row, { gap: Spacing.two }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/scan')}
            style={({ pressed }) => [styles.action, { flex: 1, gap: Spacing.two, backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="scan-outline" size={20} color={theme.tintText} />
            <ThemedText style={{ color: theme.tintText, fontWeight: 600 }}>Scan groceries</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add item manually"
            onPress={() => router.push('/pantry-item')}
            style={({ pressed }) => [styles.action, { width: 50, backgroundColor: theme.background, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="add" size={26} color={theme.text} />
          </Pressable>
        </View>
        {scansLeft !== null && (
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
            {scansLeft} free {plural(scansLeft, 'scan')} left this month
          </ThemedText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three, borderWidth: 1 },
  tile: { borderRadius: 14, padding: Spacing.two },
  statTile: { flex: 1, justifyContent: 'space-between', gap: Spacing.one },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  action: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
