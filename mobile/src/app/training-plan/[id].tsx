import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Input } from '@/components/ui';
import { showAlert } from '@/components/themed-alert';
import { useExercise, useExerciseLibrary, useWorkoutPlans } from '@/lib/exercise';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, localDate } from '@/lib/plans';
import type { WorkoutPlan, WorkoutDay } from '@/lib/exercise-types';
import { useTheme } from '@/hooks/use-theme';
export default function TrainingPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const plans = useWorkoutPlans(); const library = useExerciseLibrary(); const theme = useTheme();
  const { user } = useAuth(); const { start, sessions } = useExercise(); const qc = useQueryClient();
  const [edited, setEdited] = useState<WorkoutPlan | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const original = plans.data?.find(p => p._id === id); const plan = edited ?? original;
  if (!plan) return <Screen edges={['bottom']}><ThemedText>{plans.isLoading ? 'Loading workout plan…' : 'Plan unavailable. Reconnect and refresh your plans.'}</ThemedText><Button title="Refresh" onPress={() => void plans.refetch()} /></Screen>;
  const changeDay = (index: number, day: WorkoutDay) => setEdited({ ...plan, days: plan.days.map((d, i) => i === index ? day : d) });
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); await qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const save = () => run(async () => { await api<WorkoutPlan>(`/exercise/plans/${plan._id}`, { method: 'PATCH', body: { title: plan.title, days: plan.days, revision: plan.__v } }); setEdited(null); });
  const activate = () => {
    const active = plans.data?.find(p => p.status === 'active');
    showAlert('Activate this week?', active ? 'This deletes your previous workout plan and replaces it with this schedule. Your logged sessions stay in history.' : 'This becomes your active workout schedule.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Activate', onPress: () => void run(async () => { await api(`/exercise/plans/${plan._id}/activate`, { method: 'POST', body: { revision: plan.__v, activeId: active?._id ?? null, activeRevision: active?.__v ?? null } }); setEdited(null); }) },
    ]);
  };
  const startDay = (day: WorkoutDay) => {
    try {
      const open = sessions.find(r => r.session.status === 'in_progress');
      const sessionId = start(day, library.data ?? [], plan._id);
      // start() reopens a workout that is already running instead of starting a second one
      if (open && open.session.scheduledDate !== day.date) showAlert('Finish your current workout first', `“${open.session.title}” is still in progress, so it has been opened.`);
      router.push({ pathname: '/workout/[id]', params: { id: sessionId } });
    } catch (e) { showAlert("Couldn't start this workout", (e as Error).message); }
  };
  return <Screen edges={['bottom']}>
    {plan.status === 'draft' && <ThemedText type="subtitle">Review your AI draft</ThemedText>}
    <Input label="Plan title" value={plan.title} onChangeText={title => setEdited({ ...plan, title })} />
    <ThemedText type="small" themeColor="textSecondary">Plans include preparation time. Choose comfortable working weights during your workout. Stop a movement if it causes pain.</ThemedText>
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
    {plan.days.map((day, di) => <View key={day.date} style={{ backgroundColor: theme.backgroundElement, borderRadius: 16, padding: 16, gap: 12 }}>
      <ThemedText type="smallBold">{day.date === localDate() ? 'Today' : dateLabel(day.date)} · {day.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{day.explanation}</ThemedText>
      {day.exercises.map((p, pi) => {
        const e = library.data?.find(e => e.id === p.exerciseId);
        const alternatives = library.data?.filter(x => x.category === e?.category && x.tracking === e?.tracking && !plan.context.training.excludedExercises.includes(x.id) && x.equipment.every(eq => plan.context.training.equipment.includes(eq as typeof plan.context.training.equipment[number])) && !day.exercises.some((other, index) => index !== pi && other.exerciseId === x.id));
        const update = (patch: Partial<typeof p>) => changeDay(di, { ...day, exercises: day.exercises.map((x, i) => i === pi ? { ...x, ...patch } : x) });
        return <View key={pi} style={{ gap: 8 }}>
          <ThemedText type="smallBold">{e?.name ?? p.exerciseId}</ThemedText>
          <ThemedText type="small">{p.sets} sets · {p.durationSeconds !== null ? `${p.durationSeconds}s` : `${p.repsMin}–${p.repsMax} reps`} · {p.restSeconds}s rest</ThemedText>
          {e?.instructions.map((s, i) => <ThemedText key={i} type="small" themeColor="textSecondary">{i + 1}. {s}</ThemedText>)}
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Input label="Sets (1–3)" keyboardType="number-pad" value={String(p.sets)} onChangeText={v => update({ sets: Number(v) })} /></View><View style={{ flex: 1 }}><Input label="Rest seconds" keyboardType="number-pad" value={String(p.restSeconds)} onChangeText={v => update({ restSeconds: Number(v) })} /></View></View>
          {p.durationSeconds !== null ? <Input label="Duration per set (seconds)" keyboardType="number-pad" value={String(p.durationSeconds)} onChangeText={v => update({ durationSeconds: Number(v) })} /> : <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Input label="Minimum reps" keyboardType="number-pad" value={String(p.repsMin)} onChangeText={v => update({ repsMin: Number(v) })} /></View><View style={{ flex: 1 }}><Input label="Maximum reps" keyboardType="number-pad" value={String(p.repsMax)} onChangeText={v => update({ repsMax: Number(v) })} /></View></View>}
          <ThemedText type="small">Swap exercise</ThemedText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{alternatives?.map(x => <Chip key={x.id} label={x.name} selected={x.id === p.exerciseId} onPress={() => update({ exerciseId: x.id })} />)}</View>
        </View>;
      })}
      {plan.status === 'active' && !!day.exercises.length && (day.date > localDate()
        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.background }}><Ionicons name="calendar-outline" size={18} color={theme.textSecondary} /><ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>You can start this workout on {dateLabel(day.date)}.</ThemedText></View>
        : edited ? <ThemedText type="small" themeColor="warning">Save your plan edits below before starting this workout.</ThemedText>
          : <Button title={sessions.some(r => r.session.planId === plan._id && r.session.scheduledDate === day.date && r.session.status === 'finished') ? 'Completed · Start another session' : 'Start workout'} onPress={() => startDay(day)} />)}
    </View>)}
    {edited && <Button title="Save plan edits" onPress={save} loading={busy} />}
    {plan.status === 'draft' && <Button title="Activate this week" onPress={activate} disabled={!!edited} loading={busy} />}
    <Button title="Delete plan" variant="danger" onPress={() => showAlert('Delete plan?', 'Workout history will be preserved.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { await api(`/exercise/plans/${plan._id}`, { method: 'DELETE' }); router.back(); }) }])} />
  </Screen>;
}
