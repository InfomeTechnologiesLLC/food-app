import { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { WorkoutTracker } from '@/components/workout-tracker';
import { BottomSheet } from '@/components/bottom-sheet';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { FloatingActions } from '@/components/floating-actions';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';
import { api } from '@/lib/api';
import { localDate, timezone } from '@/lib/plans';
import { dailyWorkoutSession } from '@/lib/workout-tracking';
import type { WorkoutPlan } from '@/lib/exercise-types';
import { useTheme } from '@/hooks/use-theme';
export default function ExerciseScreen() {
  const { user, needsSignIn } = useAuth(); const plans = useWorkoutPlans();
  const { sessions } = useExercise(); const qc = useQueryClient(); const theme = useTheme();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [startDate, setStartDate] = useState(localDate());
  const today = useCalendarDate();
  const { height } = useWindowDimensions();
  const [generationOpen, setGenerationOpen] = useState(false);
  const openGeneration = () => { setStartDate(today); setError(''); setGenerationOpen(true); };
  const active = plans.data?.find(p => p.status === 'active');
  const schedule = active ?? plans.data?.find(p => p.status === 'draft');
  const day = active?.days.find(d => d.date === today);
  const selected = dailyWorkoutSession(sessions, today, active?._id);
  const row = selected;
  const generate = async () => {
    setBusy(true); setError('');
    try { const plan = await api<WorkoutPlan>('/exercise/plans', { method: 'POST', body: { timezone: timezone(), startDate } }); await qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] }); setGenerationOpen(false); router.push({ pathname: '/training-plan/[id]', params: { id: plan._id } }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <View style={styles.page}><Screen edges={[]}>
    <View style={styles.todayHeader}>
      <ThemedText type="smallBold">Today’s exercise</ThemedText>
      {schedule && <Pressable accessibilityRole="button" accessibilityLabel={schedule.status === 'draft' ? 'Review workout draft' : 'View workout schedule'} onPress={() => router.push({ pathname: '/training-plan/[id]', params: { id: schedule._id } })} style={({ pressed }) => [styles.plansButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="calendar-month" size={18} color={theme.tint} />
        <ThemedText type="smallBold" themeColor="tint">{schedule.status === 'draft' ? 'Review draft' : 'View schedule'}</ThemedText>
      </Pressable>}
    </View>
    {row || day?.exercises.length ? <WorkoutTracker key={row?.session._id ?? `${active?._id}:${today}`} row={row} day={day} planId={active?._id} /> : <View style={[styles.todayState, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{plans.isLoading ? 'Loading today’s workout…' : plans.isError && !plans.data ? 'Couldn’t load today’s schedule' : day ? 'Rest day' : active && active.days.every(d => d.date < today) ? 'Your workout week has ended' : active ? 'No workout scheduled today' : 'Plan your next workout week'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{day ? day.explanation : user?.training.enabled ? 'Generate a week or review your schedule below.' : 'Enable exercise in your profile’s training preferences to create a personalized plan.'}</ThemedText>
      {user?.training.enabled && !day && <Button title="Plan a workout week" onPress={openGeneration} />}
    </View>}
    {needsSignIn && <Button title="Sign in again to sync" onPress={() => router.push('/reauth')} />}
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}

    {plans.isError && <Button title="Couldn’t refresh plans · Retry" variant="secondary" onPress={() => void plans.refetch()} />}
  </Screen>
    <FloatingActions>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workout history"
        onPress={() => router.push('/workout-history')}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="access-time" size={22} color={theme.tintText} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Generate workout plan" onPress={openGeneration} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="add" size={30} color={theme.tintText} />
      </Pressable>
    </FloatingActions>
    <BottomSheet visible={generationOpen} title="Generate workout week" onClose={() => setGenerationOpen(false)}>
      <ScrollView style={{ maxHeight: height * 0.6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
        {user?.training.enabled ? <>
          <Input label="Week starts (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
          <Button title="Generate workout week with AI" onPress={generate} loading={busy} disabled={needsSignIn} />
          {busy && <ThemedText type="small" themeColor="textSecondary">Creating and checking your personalized plan…</ThemedText>}
        </> : <><ThemedText themeColor="textSecondary">Enable exercise in your profile’s training preferences to generate a personalized plan.</ThemedText><Button title="Open settings" variant="secondary" onPress={() => { setGenerationOpen(false); router.navigate('/settings'); }} /></>}
        {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
      </ScrollView>
    </BottomSheet>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  todayHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  plansButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  todayState: { padding: 16, borderRadius: 20, gap: 12 },
  actionButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
