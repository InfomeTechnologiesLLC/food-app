import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
import { WeightSheet } from '@/components/weight-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import type { Tip } from '@/lib/coach';
import { dateLabel } from '@/lib/plans';
import { goalProgress, targetDays, targetSummary, useProgress, type DayStatus, type RangeDays } from '@/lib/progress';
import { useTargets } from '@/lib/targets';
import { useCoach } from '@/lib/use-coach';
import { useWaterRange } from '@/lib/water';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const RANGES: readonly RangeDays[] = [7, 30];
const STATUS_ICON: Record<DayStatus, { icon: IconName; color: 'tint' | 'warning' | 'danger' | 'textSecondary' }> = {
  complete: { icon: 'checkmark-circle', color: 'tint' },
  partial: { icon: 'contrast-outline', color: 'warning' },
  missed: { icon: 'close-circle', color: 'danger' },
  pending: { icon: 'time-outline', color: 'textSecondary' },
  unplanned: { icon: 'remove-outline', color: 'textSecondary' },
};

/** Progress & tracking: the goal, how often targets were met, meals, workouts and water, as numbers. */
export default function ProgressScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [range, setRange] = useState<RangeDays>(7);
  const [logging, setLogging] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const p = useProgress(range);
  const { coach, series } = useCoach();
  const targets = useTargets();
  const from = p.dates[p.dates.length - 1]!;
  const water = useWaterRange(from, p.today);

  const t = targets.data?.ready ? targets.data : null;
  const waterByDate = Object.fromEntries((water.data?.days ?? []).map((d) => [d.date, d.totalMl]));
  const days = targetDays(p.dates, p.totals, t, waterByDate, water.data?.goalMl ?? 0);
  const sum = targetSummary(days, p.today);
  const goal = goalProgress(series, user?.body.targetWeightKg);
  const w = coach?.weight;
  const food = p.food.summary;
  const exercise = p.exercise.summary;
  const todayFood = p.food.days[0];
  const refetch = () => { p.refetch(); void water.refetch(); void targets.refetch(); };

  const tiles: { icon: IconName; label: string; value: string; sub: string; href?: Href }[] = [
    { icon: 'flame-outline', label: 'Calories on target', value: t ? `${sum.calorieDays} / ${sum.days}` : '–', sub: t ? 'days within 10%' : 'add your details', href: '/' },
    { icon: 'nutrition-outline', label: 'Protein reached', value: t ? `${sum.proteinDays} / ${sum.days}` : '–', sub: 'days', href: '/' },
    {
      icon: 'restaurant-outline', label: 'Meals eaten',
      value: food.percent !== null ? `${food.percent}%` : todayFood?.planned ? `${todayFood.done} / ${todayFood.planned}` : '–',
      sub: food.percent !== null ? `${food.done} of ${food.planned}` : todayFood?.planned ? 'today so far' : 'no meal plan', href: '/plans',
    },
    { icon: 'barbell-outline', label: 'Workouts done', value: exercise.percent === null ? `${p.exercise.sessionTotal}` : `${exercise.done} / ${exercise.planned}`, sub: exercise.percent === null ? 'logged' : `${exercise.percent}% of planned`, href: '/exercise' },
    { icon: 'water-outline', label: 'Water goal met', value: `${sum.waterDays} / ${sum.days}`, sub: 'days', href: '/' },
    { icon: 'flash-outline', label: 'Meal streak', value: `${food.streak}`, sub: food.streak === 1 ? 'day' : 'days in a row', href: '/plans' },
  ];
  const act = (tip: Tip) => (tip.id === 'weigh-in' || !tip.href ? setLogging(true) : router.push(tip.href as Href));

  return (
    <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={refetch} />}>
      {/* Goal */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.rowBetween}>
          <ThemedText style={styles.cardTitle}>Your goal</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => setLogging(true)} style={[styles.pill, { backgroundColor: theme.tint }]}>
            <Ionicons name="add" size={16} color={theme.tintText} />
            <ThemedText type="smallBold" style={{ color: theme.tintText }}>Log weight</ThemedText>
          </Pressable>
        </View>
        {goal ? (
          <>
            <View style={styles.rowBetween}>
              <Stat label="Start" value={`${goal.start} kg`} />
              <Stat label="Now" value={`${goal.current} kg`} big />
              <Stat label="Target" value={`${goal.target} kg`} />
            </View>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.fill, { width: `${goal.percent}%`, backgroundColor: theme.tint }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {goal.leftKg === 0 ? 'You reached your target weight!' : `${goal.percent}% of the way · ${Math.abs(goal.leftKg)} kg to go`}
              {w?.perWeek != null ? ` · ${w.perWeek > 0.05 ? '+' : w.perWeek < -0.05 ? '−' : ''}${Math.abs(w.perWeek).toFixed(1)} kg a week` : ''}
              {w?.etaWeeks ? ` · about ${w.etaWeeks} weeks left` : ''}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {w?.current == null ? 'Log your weight to start tracking your goal.' : 'Set a target weight in Profile → Body and goal to see your progress toward it.'}
          </ThemedText>
        )}
        {t && <ThemedText type="small" themeColor="textSecondary">Daily targets: {t.calories} kcal · {t.proteinGrams} g protein · {(t.waterMl / 1000).toFixed(1)} L water</ThemedText>}
      </View>

      <ChipGroup options={RANGES} value={range} onChange={setRange} format={(r) => `Last ${r} days`} />
      {(p.loading || water.isLoading) && <ActivityIndicator color={theme.tint} />}
      {p.error && (
        <Pressable accessibilityRole="button" onPress={refetch}>
          <ThemedText type="small" themeColor="danger">Some data couldn’t load, so numbers may be incomplete. Tap to try again.</ThemedText>
        </Pressable>
      )}

      {/* Numbers for the range */}
      {!p.loading && (
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <Pressable key={tile.label} accessibilityRole="button" accessibilityLabel={`${tile.label}: ${tile.value} ${tile.sub}`}
              onPress={() => tile.href && router.navigate(tile.href)}
              style={({ pressed }) => [styles.tile, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name={tile.icon} size={18} color={theme.tint} />
              <ThemedText style={styles.value} numberOfLines={1}>{tile.value}</ThemedText>
              <ThemedText type="small" style={{ fontWeight: 600 }} numberOfLines={1}>{tile.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={1}>{tile.sub}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Coach tips, folded away */}
      {coach && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Pressable accessibilityRole="button" onPress={() => setTipsOpen((v) => !v)} style={styles.rowBetween}>
            <View style={styles.inline}>
              <Ionicons name="bulb-outline" size={18} color={theme.tint} />
              <ThemedText style={{ fontWeight: 700 }}>Next steps ({coach.tips.length})</ThemedText>
            </View>
            <Ionicons name={tipsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
          </Pressable>
          {tipsOpen && coach.tips.map((tip) => (
            <Pressable key={tip.id} accessibilityRole="button" onPress={() => act(tip)} style={styles.tip}>
              <ThemedText type="small" style={{ flex: 1 }}>• {tip.text}</ThemedText>
              {tip.cta && <ThemedText type="smallBold" themeColor="tint">{tip.cta}</ThemedText>}
            </Pressable>
          ))}
        </View>
      )}

      {/* Day by day */}
      {!p.loading && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, gap: 0 }]}>
          <View style={[styles.dayRow, { borderBottomColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ flex: 1 }}>Day</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.col}>kcal</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.icon}>Meals</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.icon}>Gym</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.icon}>Water</ThemedText>
          </View>
          {days.map((d, i) => {
            const meal = STATUS_ICON[p.food.days[i]!.status];
            const gym = STATUS_ICON[p.exercise.days[i]!.status];
            return (
              <View key={d.date} style={[styles.dayRow, { borderBottomColor: theme.border }]}>
                <ThemedText type="small" style={{ flex: 1, fontWeight: 600 }}>{d.date === p.today ? 'Today' : dateLabel(d.date)}</ThemedText>
                <ThemedText type="small" style={[styles.col, { color: d.calorieHit ? theme.tint : d.hasFood ? theme.text : theme.textSecondary }]}>{d.hasFood ? d.calories : '–'}</ThemedText>
                <Ionicons name={meal.icon} size={18} color={theme[meal.color]} style={styles.icon} />
                <Ionicons name={gym.icon} size={18} color={theme[gym.color]} style={styles.icon} />
                <Ionicons name={d.waterHit ? 'water' : 'water-outline'} size={18} color={d.waterHit ? theme.water : theme.textSecondary} style={styles.icon} />
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, paddingTop: Spacing.two }}>
            Green kcal = within 10% of your target. Icons: green tick = done, orange = partly, red cross = missed, clock = still today, dash = nothing planned.
          </ThemedText>
        </View>
      )}

      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}><Button title="Food history" icon="restaurant-outline" variant="secondary" onPress={() => router.push('/food-history')} /></View>
        <View style={{ width: Spacing.two }} />
        <View style={{ flex: 1 }}><Button title="Workouts" icon="barbell-outline" variant="secondary" onPress={() => router.push('/workout-history')} /></View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textAlign: 'center' }}>General guidance based on your logs, not medical advice.</ThemedText>
      <WeightSheet visible={logging} onClose={() => setLogging(false)} />
    </Screen>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <ThemedText style={{ fontSize: big ? 26 : 17, lineHeight: big ? 32 : 22, fontWeight: 700 }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: 16, padding: Spacing.three, gap: 2 },
  value: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  col: { width: 56, textAlign: 'right' },
  icon: { width: 48, textAlign: 'center' },
});
