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
import { useTargets } from '@/lib/targets';
import type { MealPlan, NutritionTotals } from '@/lib/types';

const MISSING_LABEL = { sex: 'sex', birthYear: 'birth year', heightCm: 'height', weightKg: 'weight', activityLevel: 'activity level' } as const;
const TONE: Record<Tone, { icon: React.ComponentProps<typeof Ionicons>['name']; color: 'tint' | 'warning' | 'textSecondary' }> = {
  good: { icon: 'checkmark-circle', color: 'tint' },
  info: { icon: 'bulb-outline', color: 'tint' },
  warn: { icon: 'alert-circle-outline', color: 'warning' },
};
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
  const [logging, setLogging] = useState(false);
  const changes = useTargetChanges();
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
    content = (
      <>
        <View style={[styles.advice, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name={tone.icon} size={22} color={theme[tone.color]} />
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText style={{ fontWeight: 700 }}>{advice.title}</ThemedText>
            <ThemedText type="small">{advice.detail}</ThemedText>
          </View>
        </View>
        {nutrientRows(eaten, t).map((row) => {
          const over = row.left < 0;
          const color = over && (row.key === 'calories' || row.key === 'fatGrams') && t.direction !== 'gain' ? theme.warning : theme.tint;
          return (
            <View key={row.key} style={{ gap: 4 }} accessibilityLabel={`${row.label}: ${row.eaten} of ${row.target} ${row.unit}`}>
              <View style={styles.rowBetween}>
                <ThemedText type="small" style={{ fontWeight: 700 }}>{row.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.eaten} / {row.target} {row.unit} · {over ? `${-row.left} over` : `${row.left} left`}
                </ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.fill, { width: `${Math.min(100, row.percent)}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}><Button title="Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogging(true)} /></View>
          <View style={{ flex: 1 }}><Button title="Ask coach" icon="chatbubbles-outline" variant="secondary" onPress={() => router.navigate('/coach')} /></View>
        </View>
        {recentChange && (
          <View style={[styles.advice, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="trending-up-outline" size={20} color={theme.tint} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="smallBold">Weekly check-in: {recentChange.deltaKcal > 0 ? '+' : ''}{recentChange.deltaKcal} kcal a day</ThemedText>
              <ThemedText type="small">{recentChange.reason}</ThemedText>
            </View>
          </View>
        )}
        {t.warnings.map((w) => <ThemedText key={w} type="small" themeColor="warning">{w}</ThemedText>)}
        <Pressable accessibilityRole="button" onPress={() => setShowMore((v) => !v)} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="tint">{showMore ? 'Hide details' : 'How are these worked out?'}</ThemedText>
        </Pressable>
        {showMore && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              Your body burns about {t.bmr} kcal a day at rest and about {t.tdee} kcal with your activity.{' '}
              {t.direction === 'maintain' ? 'Your target keeps your weight steady.'
                : `Your target is set to ${t.direction} about ${Math.abs(t.weeklyRateKg)} kg a week.`}
            </ThemedText>
            {t.timeline && <ThemedText type="small" themeColor="textSecondary">{t.timeline.explanation}</ThemedText>}
            <ThemedText type="small" themeColor="textSecondary">Only meals you mark as eaten are counted.</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="tint">Change my details</ThemedText>
            </Pressable>
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t.notice}</ThemedText>
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
  advice: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three, borderRadius: 14 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
