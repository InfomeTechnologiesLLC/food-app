import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';

export function ExerciseProgressCard({ date, embedded = false }: { date: string; embedded?: boolean }) {
  const theme = useTheme();
  const plans = useWorkoutPlans();
  const { sessions, sync } = useExercise();
  const activePlan = plans.data?.find(plan => plan.status === 'active');
  const day = activePlan?.days.find(item => item.date === date);
  const todaySessions = sessions.filter(row => row.session.date === date);
  const completedSets = todaySessions.reduce((total, row) => total + row.session.exercises.reduce(
    (exerciseTotal, exercise) => exerciseTotal + exercise.sets.filter(set => set.status === 'completed').length,
    0,
  ), 0);
  const loggedSetCount = todaySessions.reduce((total, row) => total + row.session.exercises.reduce(
    (exerciseTotal, exercise) => exerciseTotal + exercise.sets.length,
    0,
  ), 0);
  const plannedSetCount = day?.exercises.reduce((total, exercise) => total + exercise.sets, 0) ?? 0;
  const hasLoggedWorkout = todaySessions.length > 0;
  const hasPlannedWorkout = !!day?.exercises.length;
  const targetSets = hasLoggedWorkout ? loggedSetCount : plannedSetCount;
  const hasProgress = hasLoggedWorkout || hasPlannedWorkout;
  const percent = targetSets ? Math.min(100, Math.round(completedSets / targetSets * 100)) : 0;
  const loading = plans.isLoading && !plans.data && !hasLoggedWorkout;
  const error = plans.isError && !plans.data && !hasLoggedWorkout;
  const openExercise = () => router.navigate('/exercise');

  return (
    <View style={embedded ? styles.section : [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.row}>
        <ThemedText style={{ fontSize: 17, fontWeight: 700 }}>{embedded ? 'Exercise' : 'Today’s exercise'}</ThemedText>
        <Ionicons name="fitness-outline" size={20} color={theme.tint} />
      </View>

      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading today's exercise" color={theme.tint} />
      ) : error ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">Couldn’t load today’s exercise progress.</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => { void plans.refetch(); void sync(); }} hitSlop={8}>
            <ThemedText type="small" themeColor="tint">Try again</ThemedText>
          </Pressable>
        </>
      ) : hasProgress ? (
        <>
          <View style={styles.row}>
            <View style={styles.summary}>
              <Ionicons name={percent === 100 ? 'checkmark-circle-outline' : 'barbell-outline'} size={17} color={theme.tint} />
              <ThemedText type="small">
                {percent === 100 ? 'Workout complete' : hasLoggedWorkout ? 'Workout in progress' : day?.title ?? 'Scheduled workout'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="tint">{completedSets} / {targetSets} sets</ThemedText>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Today's exercise sets completed"
            accessibilityValue={{ min: 0, max: targetSets, now: Math.min(completedSets, targetSets) }}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.tint }]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {hasLoggedWorkout
              ? `${completedSets} of ${targetSets} sets completed${hasPlannedWorkout ? ` · ${day?.exercises.length ?? 0} exercises planned` : ''}`
              : `${day?.exercises.length ?? 0} exercises planned for today`}
          </ThemedText>
          {(!hasLoggedWorkout || percent === 100) && (
            <Pressable accessibilityRole="button" onPress={openExercise} hitSlop={8}>
              <ThemedText type="small" themeColor="tint">View exercise →</ThemedText>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {day ? 'Today is a rest day. Recovery is part of a strong routine.' : 'No workout scheduled today. Plan a workout week to track your exercise progress.'}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={openExercise} hitSlop={8}>
            <ThemedText type="small" themeColor="tint">Open exercise →</ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
