import { useEffect, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { dateLabel, localDate, timezone } from '@/lib/plans';
import { dailyWorkoutSession } from '@/lib/workout-tracking';
import { DEFAULT_TRAINING, type WorkoutPlan } from '@/lib/exercise-types';
import { useTheme } from '@/hooks/use-theme';
import { useTargets } from '@/lib/targets';
/** What the generated week focuses on, from the user's body goal (the server uses the same goal). */
const FOCUS = {
  lose: { icon: 'local-fire-department', title: 'Lose fat', text: 'Full-body sessions with some cardio, keeping strength work so you keep muscle.' },
  gain: { icon: 'fitness-center', title: 'Build muscle', text: 'Strength exercises for every major muscle, getting a little harder each week.' },
  maintain: { icon: 'directions-run', title: 'Stay fit', text: 'A balance of strength, mobility and cardio.' },
} as const;
/** Users we already planned a week for automatically in this app session, so it never runs twice. */
const suggestedFor = new Set<string>();

export default function ExerciseScreen() {
  const { user, needsSignIn, updateTraining } = useAuth(); const plans = useWorkoutPlans();
  const { sessions } = useExercise(); const qc = useQueryClient(); const theme = useTheme();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [startDate, setStartDate] = useState(localDate());
  const today = useCalendarDate();
  const targets = useTargets();
  const direction = targets.data?.ready ? targets.data.direction
    : user?.preferences.goal === 'weight_loss' ? 'lose' : user?.preferences.goal === 'muscle_gain' ? 'gain' : 'maintain';
  const focus = FOCUS[direction];
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
  const [suggesting, setSuggesting] = useState(false);
  /** Plans a week from today for the user's goal and makes it the active schedule (no review step). */
  const suggest = async () => {
    setSuggesting(true); setError('');
    try {
      const draft = await api<WorkoutPlan>('/exercise/plans', { method: 'POST', body: { timezone: timezone(), startDate: localDate() } });
      await api(`/exercise/plans/${draft._id}/activate`, { method: 'POST', body: { revision: draft.__v, activeId: active?._id ?? null, activeRevision: active?.__v ?? null } });
      await qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] });
    } catch (e) { setError((e as Error).message); } finally { setSuggesting(false); }
  };
  /** One tap for new users: beginner settings, no equipment, 3 days a week, aimed at their body goal. */
  const quickStart = async () => {
    if (!user) return;
    suggestedFor.add(user._id); // this function plans the week itself, so the automatic one must not run too
    setSuggesting(true); setError('');
    try { await updateTraining({ ...DEFAULT_TRAINING, ...user.training, enabled: true, goal: direction === 'gain' ? 'muscle_gain' : 'general_fitness' }); }
    catch (e) { setError((e as Error).message); setSuggesting(false); return; }
    await suggest();
  };
  // Exercise is on but there is no schedule at all: the coach plans a week without being asked
  const canSuggest = !!user?.training.enabled && !!plans.data && !plans.isError && !active && !schedule && !needsSignIn;
  useEffect(() => {
    if (!canSuggest || !user || suggestedFor.has(user._id)) return;
    suggestedFor.add(user._id);
    // Deferred so the loading state is set from a callback, not during the effect
    const timer = setTimeout(() => void suggest(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSuggest, user?._id]);
  const weekEnded = !!active && active.days.every(d => d.date < today);
  const nextDay = !day?.exercises.length ? active?.days.find(d => d.date > today && d.exercises.length > 0) : undefined;
  return <View style={styles.page}><Screen edges={[]}>
    <View style={styles.todayHeader}>
      <ThemedText type="smallBold">Today’s exercise</ThemedText>
      <View style={styles.headerActions}>
      {schedule && <Pressable accessibilityRole="button" accessibilityLabel={schedule.status === 'draft' ? 'Review workout draft' : 'View workout schedule'} onPress={() => router.push({ pathname: '/training-plan/[id]', params: { id: schedule._id } })} style={({ pressed }) => [styles.plansButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="calendar-month" size={18} color={theme.tint} />
        <ThemedText type="smallBold" themeColor="tint">{schedule.status === 'draft' ? 'Review draft' : 'View schedule'}</ThemedText>
      </Pressable>}
      {user?.training.enabled && <Pressable accessibilityRole="button" accessibilityLabel="Generate a new workout week" onPress={openGeneration} style={({ pressed }) => [styles.plansButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="auto-awesome" size={18} color={theme.tint} />
        <ThemedText type="smallBold" themeColor="tint">New week</ThemedText>
      </Pressable>}
      </View>
    </View>
    <View style={[styles.focus, { backgroundColor: theme.backgroundElement }]}>
      <MaterialIcons name={focus.icon} size={22} color={theme.tint} />
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold">Plan focus: {focus.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{focus.text}</ThemedText>
      </View>
    </View>
    {suggesting ? <View style={[styles.todayState, { backgroundColor: theme.backgroundElement, alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={theme.tint} />
      <ThemedText type="smallBold" style={{ textAlign: 'center' }}>Your coach is planning your workout week</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Exercises for your goal ({focus.title.toLowerCase()}), on your training days. This takes about 20–40 seconds.</ThemedText>
    </View> : row || day?.exercises.length ? <WorkoutTracker key={row?.session._id ?? `${active?._id}:${today}`} row={row} day={day} planId={active?._id} /> : <View style={[styles.todayState, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{plans.isLoading ? 'Loading today’s workout…' : plans.isError && !plans.data ? 'Couldn’t load today’s schedule' : day ? 'Rest day' : active && active.days.every(d => d.date < today) ? 'Your workout week has ended' : active ? 'No workout scheduled today' : 'Plan your next workout week'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{day ? day.explanation : user?.training.enabled ? 'Generate a week or review your schedule below.' : 'Your coach can plan a week of workouts for your goal.'}</ThemedText>
      {nextDay && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><MaterialIcons name="event" size={18} color={theme.tint} /><ThemedText type="small">Next workout: <ThemedText type="smallBold">{dateLabel(nextDay.date)} · {nextDay.title}</ThemedText></ThemedText></View>}
      {user?.training.enabled && !day && (weekEnded || !active) && <Button title="Plan my week" icon="sparkles-outline" onPress={() => void suggest()} />}
      {!user?.training.enabled && <>
        <Button title="Suggest a plan for me" icon="sparkles-outline" onPress={() => void quickStart()} />
        <ThemedText type="small" themeColor="textSecondary">Starts you as a beginner: 3 days a week (Mon, Wed, Fri), 30 minutes, no equipment needed. You can change this any time.</ThemedText>
        <Button title="Choose my own settings" variant="secondary" onPress={() => router.push('/training-settings')} />
      </>}
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
  headerActions: { flexDirection: 'row', gap: 8 },
  todayHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  plansButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  todayState: { padding: 16, borderRadius: 20, gap: 12 },
  focus: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16 },
  actionButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
