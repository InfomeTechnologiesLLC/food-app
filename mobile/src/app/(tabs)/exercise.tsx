import { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { FloatingActions } from '@/components/floating-actions';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, humanize } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useExercise, useWorkoutPlans, useExerciseLibrary } from '@/lib/exercise';
import { api } from '@/lib/api';
import { localDate, timezone } from '@/lib/plans';
import { weeklyWorkoutTotals } from '@/lib/workout-sync';
import type { WorkoutPlan } from '@/lib/exercise-types';
import { useTheme } from '@/hooks/use-theme';
export default function ExerciseScreen() {
  const { user, needsSignIn } = useAuth(); const plans = useWorkoutPlans(); const library = useExerciseLibrary();
  const { sessions, start, sync, syncing } = useExercise(); const qc = useQueryClient(); const theme = useTheme();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [startDate, setStartDate] = useState(localDate());
  const today = localDate(); const weekStart = new Date(`${today}T12:00:00`); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const startDay = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  const totals = weeklyWorkoutTotals(sessions.map(r => r.session), startDay, today);
  const activeSession = sessions.find(s => s.session.status === 'in_progress');
  const pending = sessions.filter(s => s.pending).length;
  const generate = async () => {
    setBusy(true); setError('');
    try { const plan = await api<WorkoutPlan>('/exercise/plans', { method: 'POST', body: { timezone: timezone(), startDate } }); await qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] }); router.push({ pathname: '/training-plan/[id]', params: { id: plan._id } }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const logCardio = () => {
    try { const id = start({ date: today, title: 'Walking', explanation: 'Manually logged activity', exercises: [{ exerciseId: 'walk', sets: 1, repsMin: null, repsMax: null, durationSeconds: 600, restSeconds: 30 }] }, library.data ?? [], null); router.push({ pathname: '/workout/[id]', params: { id } }); } catch (e) { setError((e as Error).message); }
  };
  return <View style={styles.page}><Screen edges={['bottom']}>
    <ThemedText themeColor="textSecondary">{totals.workouts} workouts · {totals.completedSets} sets · {Math.round(totals.minutes)} logged minutes this week</ThemedText>
    {needsSignIn && <Button title="Sign in again to sync" onPress={() => router.push('/reauth')} />}
    {activeSession && <Button title={`Resume ${activeSession.session.title}`} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: activeSession.session._id } })} />}
    {!!pending && <Button title={`${pending} workout${pending === 1 ? '' : 's'} waiting to sync · Retry`} variant="secondary" onPress={() => void sync()} loading={syncing} />}
    {user?.training.enabled ? <>
      <Input label="Week starts (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
      <Button title="Generate workout week with AI" onPress={generate} loading={busy} disabled={needsSignIn} />
      {busy && <ThemedText type="small" themeColor="textSecondary">Creating and checking your personalized plan…</ThemedText>}
    </> : <ThemedText themeColor="textSecondary">Exercise is optional. Enable it in your profile’s training preferences to generate a personalized plan.</ThemedText>}
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
    {plans.isLoading && <ThemedText>Loading plans…</ThemedText>}
    {plans.isError && <Button title="Couldn’t refresh plans · Retry" variant="secondary" onPress={() => void plans.refetch()} />}
    {plans.data?.filter(p => p.status !== 'archived').map(p => <View key={p._id} style={{ backgroundColor: theme.backgroundElement, borderRadius: 16, padding: 16, gap: 8 }}><ThemedText type="smallBold">{p.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{humanize(p.status)} · {p.days[0]?.date} · {p.days.filter(d => d.exercises.length).length} workouts</ThemedText><Button title={p.status === 'draft' ? 'Review draft' : 'View schedule'} variant="secondary" onPress={() => router.push({ pathname: '/training-plan/[id]', params: { id: p._id } })} /></View>)}
    <View style={styles.actionSpace} />
  </Screen>
    <FloatingActions>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workout history"
        onPress={() => router.push('/workout-history')}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
        <MaterialIcons name="access-time" size={22} color={theme.tintText} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Walk"
        accessibilityState={{ disabled: !library.data?.some(e => e.id === 'walk') }}
        disabled={!library.data?.some(e => e.id === 'walk')}
        onPress={logCardio}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.tint, opacity: !library.data?.some(e => e.id === 'walk') ? 0.5 : pressed ? 0.7 : 1 }]}>
        <MaterialCommunityIcons name="run" size={30} color={theme.tintText} />
      </Pressable>
    </FloatingActions>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  actionSpace: { height: 136 },
  actionButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
