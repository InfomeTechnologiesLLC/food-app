import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { HealthCard } from '@/components/health-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLabel } from '@/lib/plans';
import { useProgress, type DayStatus, type ExerciseDay, type FoodDay, type RangeDays, type Verdict } from '@/lib/progress';

type Tab = 'food' | 'exercise';
const TABS: readonly Tab[] = ['food', 'exercise'];
const RANGES: readonly RangeDays[] = [7, 30];

const VERDICTS: Record<Verdict, { label: string; color: 'tint' | 'warning' | 'danger' | 'textSecondary' }> = {
  on_track: { label: 'On track', color: 'tint' },
  behind: { label: 'Slightly behind', color: 'warning' },
  off_track: { label: 'Off track', color: 'danger' },
  no_plan: { label: 'Nothing planned yet', color: 'textSecondary' },
};
const STATUS: Record<DayStatus, { icon: React.ComponentProps<typeof Ionicons>['name']; color: 'tint' | 'warning' | 'danger' | 'textSecondary' }> = {
  complete: { icon: 'checkmark-circle', color: 'tint' },
  partial: { icon: 'contrast-outline', color: 'warning' },
  missed: { icon: 'close-circle', color: 'danger' },
  pending: { icon: 'time-outline', color: 'textSecondary' },
  unplanned: { icon: 'remove-circle-outline', color: 'textSecondary' },
};

export default function ProgressScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('food');
  const [range, setRange] = useState<RangeDays>(7);
  const p = useProgress(range);
  const isFood = tab === 'food';
  const view = isFood ? p.food : p.exercise;
  const v = VERDICTS[view.summary.verdict];
  const unit = isFood ? 'meals eaten' : 'planned workouts done';

  return (
    <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.refetch} />}>
            <HealthCard />

      <ChipGroup options={TABS} value={tab} onChange={setTab} format={(t) => (t === 'food' ? 'Food' : 'Exercise')} />
      <ChipGroup options={RANGES} value={range} onChange={setRange} format={(r) => `Last ${r} days`} />

      {p.loading && <ActivityIndicator color={theme.tint} />}
      {p.error && (
        <>
          <ThemedText themeColor="danger">{p.error.message}</ThemedText>
          <Button title="Try again" onPress={p.refetch} />
        </>
      )}

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold" themeColor={v.color}>{v.label}</ThemedText>
        {view.summary.percent !== null ? (
          <>
            <ThemedText style={styles.percent}>{view.summary.percent}%</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {view.summary.done} of {view.summary.planned} {unit} · {view.summary.streak}-day streak
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {isFood
              ? 'No meal plan covers these days. Create a plan in the Meals tab to start tracking.'
              : !p.exercise.enabled
                ? 'Exercise is optional. Turn it on to plan and track workouts.'
                : 'No workout plan covers these days. Create one in the Exercise tab to start tracking.'}
          </ThemedText>
        )}
        {!isFood && !p.exercise.enabled && <Button title="Set up exercise" variant="secondary" onPress={() => router.push('/training-settings')} />}
      </View>

      {view.days.map((day) => {
        const s = STATUS[day.status];
        return (
          <View key={day.date} style={[styles.row, { borderBottomColor: theme.border }]}>
            <Ionicons name={s.icon} size={22} color={theme[s.color]} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>{dateLabel(day.date)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isFood ? foodLine(day as FoodDay) : exerciseLine(day as ExerciseDay)}
              </ThemedText>
            </View>
          </View>
        );
      })}

      <Button
        title={isFood ? 'Open full food history' : 'Open full workout history'}
        variant="secondary"
        onPress={() => router.push(isFood ? '/food-history' : '/workout-history')}
      />
    </Screen>
  );
}

function foodLine(d: FoodDay) {
  if (d.planned === 0) return d.done ? `${d.done} meals eaten · ~${d.calories} kcal · no plan that day` : 'Nothing planned or eaten';
  return `${d.done} of ${d.planned} meals${d.done ? ` · ~${d.calories} kcal` : ''}${d.status === 'pending' ? ' · today' : ''}`;
}
function exerciseLine(d: ExerciseDay) {
  if (d.sessions.length) return `${d.sessions[0]!.title} · ${d.sets} sets done${d.planned ? '' : ' · extra session'}`;
  if (d.status === 'unplanned') return 'Rest day';
  return d.status === 'pending' ? 'Planned for today' : 'Planned, not done';
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.one },
  percent: { fontSize: 40, lineHeight: 46, fontWeight: 700 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});