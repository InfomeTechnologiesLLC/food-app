import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { FloatingActions } from '@/components/floating-actions';
import { LogFoodSheet } from '@/components/log-food-sheet';
import { PlanContent } from '@/components/plan-content';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAutoMealWeek } from '@/lib/auto-week';
import { activePlan, usePlan, usePlans } from '@/lib/plans';

/**
 * Meals: the coach plans the whole week (breakfast, lunch, snack and dinner) by itself, and the
 * next week once this one ends. Meals can be filtered by day and type, changed one by one, and
 * marked as eaten; anything else eaten is logged with "Log food".
 */
export default function PlansScreen() {
  const theme = useTheme();
  const { data: plans = [], isLoading, error: plansError } = usePlans();
  // No plan for today, or the last one has ended: the coach plans the week
  const week = useAutoMealWeek();
  const [logging, setLogging] = useState(false);

  const current = activePlan(plans);
  const { data: currentMeals, error: currentError, isLoading: currentLoading } = usePlan(current?._id);
  const planning = week.planning || (week.needed && !week.error);

  return (
    <View style={styles.page}>
      <Screen edges={[]}>
        {planning ? (
          <View style={[styles.planning, { backgroundColor: theme.backgroundElement }]}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText style={{ fontWeight: 700, textAlign: 'center' }}>Your coach is planning your week</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Breakfast, lunch, snack and dinner for 7 days, from your pantry, your goal and the foods you like. This takes about a minute.
            </ThemedText>
          </View>
        ) : week.error ? (
          <View style={[styles.planning, { backgroundColor: theme.backgroundElement }]}>
            <MaterialIcons name="error-outline" size={32} color={theme.danger} />
            <ThemedText style={{ fontWeight: 700, textAlign: 'center' }}>Couldn’t plan your week</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{week.error.message}</ThemedText>
            <Button title="Try again" icon="refresh" onPress={week.retry} />
          </View>
        ) : isLoading || currentLoading ? <ActivityIndicator /> : currentError || plansError ? (
          <ThemedText themeColor="danger">{(currentError ?? plansError)?.message}</ThemedText>
        ) : currentMeals ? (
          <>
            <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.headerIcon, { backgroundColor: `${theme.tint}1F` }]}>
                <MaterialIcons name="auto-awesome" size={22} color={theme.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">Your week, planned by your coach</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Change any meal you don’t like. A new week is planned when this one ends.</ThemedText>
              </View>
            </View>
            <Button title="Ate something else? Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogging(true)} />
            <PlanContent key={currentMeals._id} plan={currentMeals} />
            {/* Room for the floating history button */}
            <View style={{ height: 72 }} />
          </>
        ) : null}
      </Screen>
      <FloatingActions>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Food history"
          onPress={() => router.push('/food-history')}
          style={({ pressed }) => [styles.round, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="access-time" size={22} color={theme.tintText} />
        </Pressable>
      </FloatingActions>
      <LogFoodSheet visible={logging} onClose={() => setLogging(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  planning: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four, borderRadius: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 18, borderWidth: 1 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
