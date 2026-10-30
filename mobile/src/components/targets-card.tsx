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
  const [showAdvice, setShowAdvice] = useState(false);
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
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{row.label}</ThemedText>
                <ThemedText style={styles.tileValue}>{row.eaten}<ThemedText type="small" themeColor="textSecondary"> / {row.target}{row.unit === 'g' ? ' g' : ''}</ThemedText></ThemedText>
                <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.fill, { width: `${Math.min(100, row.percent)}%`, backgroundColor: color }]} />
                </View>
                <ThemedText type="small" style={{ fontSize: 12, color: over ? color : theme.textSecondary }}>{over ? `${-row.left} over` : `${row.left} left`}</ThemedText>
              </View>
            );
          })}
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
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
