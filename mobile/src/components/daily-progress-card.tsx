import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dailyProgress } from '@/lib/daily-progress';
import type { MealPlan, NutritionTotals } from '@/lib/types';

export function DailyProgressCard({ plan, history, date, loading, error, onRetry }: {
  plan?: MealPlan;
  date: string;
  history?: NutritionTotals;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const progress = dailyProgress(plan, history, date);
  const hasMeals = !!progress?.totalMeals;
  const openMeals = () => plan
    ? router.push({ pathname: '/plan/[id]', params: { id: plan._id } })
    : router.navigate('/plans');

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.row}>
        <ThemedText style={{ fontSize: 17, fontWeight: 700 }}>Today’s progress</ThemedText>
        <Ionicons name="restaurant-outline" size={20} color={theme.tint} />
      </View>
      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading today's meals" color={theme.tint} />
      ) : error ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">Couldn’t load today’s meals.</ThemedText>
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
            <ThemedText type="small" themeColor="tint">Try again</ThemedText>
          </Pressable>
        </>
      ) : hasMeals && progress ? (
        <>
          <View style={styles.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="checkmark-done-outline" size={16} color={theme.tint} />
              <ThemedText type="small">{progress.eatenMeals}{progress.hasTarget ? ` / ${progress.totalMeals}` : ''} meals eaten</ThemedText>
            </View>
            {progress.hasTarget && <ThemedText type="small" themeColor="tint">{Math.round(progress.eatenMeals / progress.totalMeals * 100)}%</ThemedText>}
          </View>
          {progress.hasTarget && <View
            accessibilityRole="progressbar"
            accessibilityLabel="Today's meals eaten"
            accessibilityValue={{ min: 0, max: progress.totalMeals, now: progress.eatenMeals }}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.track, { width: `${progress.eatenMeals / progress.totalMeals * 100}%`, backgroundColor: theme.tint }]} />
          </View>}
          <View style={styles.nutrients}>
            {([
              ['Calories', 'calories', 'kcal'],
              ['Protein', 'proteinGrams', 'g'],
              ['Carbs', 'carbsGrams', 'g'],
              ['Fat', 'fatGrams', 'g'],
            ] as const).map(([label, key, unit]) => (
              <View key={key} style={styles.nutrient}>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{label}</ThemedText>
                <ThemedText style={{ fontSize: 20, lineHeight: 26, fontWeight: 700 }}>
                  {Math.round(progress.eaten[key])}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                  {progress.hasTarget ? `/ ${Math.round(progress.planned[key])} ` : ''}{unit}
                </ThemedText>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {plan ? 'No meals planned for today. Add more days to track your progress.' : 'Plan today’s meals to see nutrition totals and track what you eat.'}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={openMeals} hitSlop={8}>
            <ThemedText type="small" themeColor="tint">{plan ? 'View plan →' : 'Plan meals →'}</ThemedText>
          </Pressable>
        </>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.push('/food-history')} hitSlop={8}>
        <ThemedText type="small" themeColor="tint">Food history →</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  nutrients: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingVertical: Spacing.one },
  nutrient: { flexGrow: 1, flexBasis: 60, gap: 2 },
});
