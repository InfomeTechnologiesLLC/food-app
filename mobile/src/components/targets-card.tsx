import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { LogFoodSheet } from '@/components/log-food-sheet';
import { MeasurementsForm } from '@/components/measurements-form';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { dailyProgress } from '@/lib/daily-progress';
import { dayAdvice, nutrientRows, type Macros, type Tone } from '@/lib/nutrition-coach';
import { useTargetChanges } from '@/lib/coach-api';
import { addDaysLocal } from '@/lib/nutrition-coach';
import { usePeriod } from '@/lib/period';
import { useProgress } from '@/lib/progress';
import { useTargets } from '@/lib/targets';
import { useWater } from '@/lib/water';
import type { MealPlan, NutritionTotals } from '@/lib/types';

const MISSING_LABEL = { sex: 'sex', birthYear: 'birth year', heightCm: 'height', weightKg: 'weight', activityLevel: 'activity level' } as const;
const TONE: Record<Tone, { icon: React.ComponentProps<typeof Ionicons>['name']; color: 'tint' | 'warning' | 'textSecondary' }> = {
  good: { icon: 'checkmark-circle', color: 'tint' },
  info: { icon: 'bulb-outline', color: 'tint' },
  warn: { icon: 'alert-circle-outline', color: 'warning' },
};
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const minus = (a: Macros, b: Macros): Macros => ({
  calories: a.calories - b.calories, proteinGrams: a.proteinGrams - b.proteinGrams, carbsGrams: a.carbsGrams - b.carbsGrams, fatGrams: a.fatGrams - b.fatGrams,
});

/** Today's calories, protein, carbs and fat against the user's targets, with advice for the rest of the day. */
export function TargetsCard({ date, plan, history, loading }: { date: string; plan?: MealPlan; history?: NutritionTotals; loading: boolean }) {
  const theme = useTheme();
  const { user } = useAuth();
  const targets = useTargets();
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [logging, setLogging] = useState(false);
  const changes = useTargetChanges();
  const water = useWater(date);
  const progress = useProgress(7);
  const period = usePeriod(date);
  // The latest weekly check-in change, shown for a week
  const recentChange = changes.data?.find((c) => c.date >= addDaysLocal(date, -6));
  if (!user) return null;
  const t = targets.data;

  const editSheet = (
    <BottomSheet visible={editing} title="Body and goal" onClose={() => setEditing(false)}>
      {editing && <MeasurementsForm initial={user.body} onSaved={() => setEditing(false)} />}
    </BottomSheet>
  );

  let content: React.ReactNode;
  if (targets.isLoading || loading) content = <ActivityIndicator color={theme.tint} />;
  else if (targets.error || !t) {
    content = (
      <Pressable accessibilityRole="button" onPress={() => void targets.refetch()} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary">Couldn’t load your targets. <ThemedText type="small" themeColor="tint">Try again</ThemedText></ThemedText>
      </Pressable>
    );
  } else if (!t.ready) {
    content = (
      <>
        <ThemedText type="small" themeColor="textSecondary">
          Add your {t.missing.map((m) => MISSING_LABEL[m]).join(', ')} and I’ll work out how many calories, how much protein, carbs, fat and water you need each day.
        </ThemedText>
        <Button title="Add my details" variant="secondary" onPress={() => setEditing(true)} />
      </>
    );
  } else {
    const day = dailyProgress(plan, history, date);
    const eaten = day.eaten;
    const advice = dayAdvice({
      eaten, targets: t, plannedLeft: minus(day.planned, eaten), mealsLeft: day.totalMeals - day.eatenMeals, hour: new Date().getHours(),
    });
    const tone = TONE[advice.tone];
    // The day's targets as a checklist: each one ticks when reached
    const workoutDay = progress.exercise.days[0];
    const periodRest = !!period.data?.settings.tracking && !!period.data.status.onPeriod && period.data.settings.exercise === 'rest';
    const workout = !progress.exercise.enabled ? { value: 'Off', sub: 'tap to set up', met: null }
      : !user.trainingDaysChosen ? { value: 'Set up', sub: 'choose your days', met: null }
      : workoutDay?.done ? { value: 'Done', sub: 'great work', met: true }
        : periodRest ? { value: 'Rest', sub: 'period day', met: null }
          : workoutDay?.planned ? { value: 'To do', sub: 'planned today', met: false }
            : { value: 'Rest', sub: 'rest day', met: null };
    const waterMet = water.data ? water.data.totalMl >= water.data.goalMl : false;
    const calorieMet = t.calories > 0 && Math.abs(eaten.calories - t.calories) <= t.calories * 0.1;
    const checklist: { label: string; icon: IconName; met: boolean | null }[] = [
      { label: 'Calories', icon: 'flame', met: calorieMet },
      { label: 'Protein', icon: 'nutrition', met: eaten.proteinGrams >= t.proteinGrams },
      { label: 'Water', icon: 'water', met: waterMet },
      { label: 'Meals', icon: 'restaurant', met: day.totalMeals ? day.eatenMeals >= day.totalMeals : null },
      { label: 'Workout', icon: 'barbell', met: workout.met },
    ];
    const counted = checklist.filter((c) => c.met !== null);
    const done = counted.filter((c) => c.met).length;
    content = (
      <>
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            <ThemedText type="smallBold">{done} of {counted.length}</ThemedText> targets reached today
          </ThemedText>
          <View style={styles.checks}>
            {checklist.map((c) => (
              <View key={c.label} style={styles.check} accessibilityLabel={`${c.label}: ${c.met === null ? 'not needed today' : c.met ? 'reached' : 'not yet'}`}>
                <View style={[styles.checkIcon, { backgroundColor: c.met ? theme.tint : theme.background, borderColor: c.met ? theme.tint : theme.border, opacity: c.met === null ? 0.45 : 1 }]}>
                  <Ionicons name={c.met ? 'checkmark' : c.icon} size={16} color={c.met ? theme.tintText : theme.textSecondary} />
                </View>
                <ThemedText type="small" themeColor={c.met ? 'text' : 'textSecondary'} style={{ fontSize: 11 }}>{c.label}</ThemedText>
              </View>
            ))}
          </View>
        </View>
        {/* One-line advice; tap for the full sentence */}
        <Pressable accessibilityRole="button" onPress={() => setShowAdvice((v) => !v)} style={[styles.advice, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name={tone.icon} size={20} color={theme[tone.color]} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>{advice.title}</ThemedText>
            <ThemedText type="small" numberOfLines={showAdvice ? undefined : 1}>{advice.detail}</ThemedText>
          </View>
          <Ionicons name={showAdvice ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
        </Pressable>
        <View style={styles.grid}>
          {nutrientRows(eaten, t).map((row) => {
            const over = row.left < 0;
            const color = over && (row.key === 'calories' || row.key === 'fatGrams') && t.direction !== 'gain' ? theme.warning : theme.tint;
            return (
              <View key={row.key} style={[styles.tile, { backgroundColor: theme.background }]} accessibilityLabel={`${row.label}: ${row.eaten} of ${row.target} ${row.unit}, ${over ? `${-row.left} over` : `${row.left} left`}`}>
                <View style={styles.rowBetween}>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{row.label}</ThemedText>
                  {(row.key === 'calories' ? calorieMet : row.key === 'proteinGrams' ? eaten.proteinGrams >= t.proteinGrams : false) && <Ionicons name="checkmark-circle" size={16} color={theme.tint} />}
                </View>
                <ThemedText style={styles.tileValue}>{row.eaten}<ThemedText type="small" themeColor="textSecondary"> / {row.target}{row.unit === 'g' ? ' g' : ''}</ThemedText></ThemedText>
                <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.fill, { width: `${Math.min(100, row.percent)}%`, backgroundColor: color }]} />
                </View>
                <ThemedText type="small" style={{ fontSize: 12, color: over ? color : theme.textSecondary }}>{over ? `${-row.left} over` : `${row.left} left`}</ThemedText>
              </View>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/plans')} style={({ pressed }) => [styles.tile, { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>Meals</ThemedText>
              <Ionicons name={day.totalMeals && day.eatenMeals >= day.totalMeals ? 'checkmark-circle' : 'restaurant-outline'} size={16} color={theme.tint} />
            </View>
            <ThemedText style={styles.tileValue}>{day.eatenMeals}<ThemedText type="small" themeColor="textSecondary"> / {day.totalMeals || '–'}</ThemedText></ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{day.totalMeals ? 'eaten from your plan' : 'no plan today'}</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/exercise')} style={({ pressed }) => [styles.tile, { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>Workout</ThemedText>
              <Ionicons name={workout.met ? 'checkmark-circle' : 'barbell-outline'} size={16} color={theme.tint} />
            </View>
            <ThemedText style={styles.tileValue}>{workout.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{workout.sub}</ThemedText>
          </Pressable>
        </View>
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}><Button title="Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogging(true)} /></View>
          <View style={{ flex: 1 }}><Button title="Ask coach" icon="chatbubbles-outline" variant="secondary" onPress={() => router.navigate('/coach')} /></View>
        </View>
        {recentChange && (
          <Pressable accessibilityRole="button" onPress={() => setShowMore(true)} style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="trending-up-outline" size={16} color={theme.tint} />
            <ThemedText type="smallBold">Weekly check-in: {recentChange.deltaKcal > 0 ? '+' : ''}{recentChange.deltaKcal} kcal a day</ThemedText>
          </Pressable>
        )}
        {t.warnings.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setShowMore(true)} style={styles.inline}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.warning} />
            <ThemedText type="small" themeColor="warning" numberOfLines={showMore ? undefined : 1} style={{ flex: 1 }}>{t.warnings[0]}</ThemedText>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => setShowMore((v) => !v)} hitSlop={8} style={styles.inline}>
          <Ionicons name="information-circle-outline" size={16} color={theme.tint} />
          <ThemedText type="smallBold" themeColor="tint">{showMore ? 'Hide details' : 'How these are worked out'}</ThemedText>
        </Pressable>
        {showMore && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              Your body burns about {t.bmr} kcal a day at rest and about {t.tdee} kcal with your activity.{' '}
              {t.direction === 'maintain' ? 'Your target keeps your weight steady.'
                : `Your target is set to ${t.direction} about ${Math.abs(t.weeklyRateKg)} kg a week.`}
            </ThemedText>
            {t.timeline && <ThemedText type="small" themeColor="textSecondary">{t.timeline.explanation}</ThemedText>}
            {recentChange && <ThemedText type="small" themeColor="textSecondary">Weekly check-in: {recentChange.reason}</ThemedText>}
            {t.warnings.slice(1).map((w) => <ThemedText key={w} type="small" themeColor="warning">{w}</ThemedText>)}
            <ThemedText type="small" themeColor="textSecondary">Only meals you mark as eaten or log are counted.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t.notice}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="tint">Change my details</ThemedText>
            </Pressable>
          </View>
        )}
      </>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Today’s targets</ThemedText>
        <Ionicons name="flag-outline" size={20} color={theme.tint} />
      </View>
      {content}
      {editSheet}
      <LogFoodSheet visible={logging} onClose={() => setLogging(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  advice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: 14, padding: Spacing.two, gap: 4 },
  tileValue: { fontSize: 20, lineHeight: 26, fontWeight: 700 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: Spacing.two, borderRadius: 999 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  checks: { flexDirection: 'row', justifyContent: 'space-between' },
  check: { alignItems: 'center', gap: 4, flex: 1 },
  checkIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
