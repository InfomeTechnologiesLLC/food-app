import { CardioLog } from '@/components/cardio-log';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input } from '@/components/ui';
import { showAlert } from '@/components/themed-alert';
import { useExercise, useExerciseLibrary } from '@/lib/exercise';
import { useAuth } from '@/lib/auth';
import { readLocal, writeLocal } from '@/lib/local-store';
import type { SetLog } from '@/lib/exercise-types';
import { useTheme } from '@/hooks/use-theme';
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { user, needsSignIn } = useAuth(); const theme = useTheme();
  const { sessions, save, sync, syncing, resolve } = useExercise(); const library = useExerciseLibrary();
  const [error, setError] = useState(''); const [now, setNow] = useState(() => Date.now());
  const [restUntil, setRestUntil] = useState(() => readLocal<number>(user!._id, `rest:${id}`) ?? 0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const row = sessions.find(r => r.session._id === id); const session = row?.session;
  if (!session || !row) return <Screen edges={['bottom']}><ThemedText>Loading saved workout…</ThemedText></Screen>;
  const editable = session.status === 'in_progress';
  const updateSet = (ei: number, si: number, patch: Partial<SetLog>) => {
    save({ ...session, exercises: session.exercises.map((e, i) => i !== ei ? e : { ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, ...patch }) }) });
  };
  const setNumber = (ei: number, si: number, key: 'reps' | 'weightKg' | 'durationSeconds' | 'distanceKm', text: string) => {
    const value = text.trim() ? Number(text.replace(',', '.')) : null;
    const max = { reps: 200, weightKg: 500, durationSeconds: 86400, distanceKm: 1000 }[key];
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max || ((key === 'reps' || key === 'durationSeconds') && (!Number.isInteger(value) || value < 1)))) { setError(`Enter a valid ${key === 'reps' ? 'rep count' : key === 'durationSeconds' ? 'duration' : 'amount'}.`); return; }
    setError(''); updateSet(ei, si, { [key]: value });
  };
  const finish = () => {
    if (!session.exercises.some(e => e.sets.some(s => s.status === 'completed'))) { setError('Complete at least one set before finishing. You can save a partial workout.'); return; }
    showAlert('Finish workout?', 'Completed sets will count toward your progress. Pending sets remain uncompleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Finish', onPress: () => { save({ ...session, status: 'finished', finishedAt: new Date().toISOString() }); void sync(); } }]);
  };
  if (!row.conflict && session.exercises.length === 1 && session.exercises[0].definition.category === 'cardio' && session.exercises[0].sets.length === 1) {
    return <CardioLog key={id} row={row} library={library.data ?? []} save={save} sync={sync} syncing={syncing} needsSignIn={needsSignIn} />;
  }
  return <Screen edges={['bottom']}>
    <ThemedText type="subtitle">{session.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{session.date} · {editable ? 'Saved on this device as you log' : session.status === 'finished' ? 'Completed workout' : 'Discarded workout'}</ThemedText>
    {needsSignIn && <ThemedText themeColor="danger">Sign in again from Exercise to sync. Your workout stays saved here.</ThemedText>}
    {!!row.error && <ThemedText themeColor="danger">{row.error}</ThemedText>}
    {row.conflict && <View style={{ gap: 8 }}><ThemedText type="smallBold">Choose which version to keep</ThemedText><ThemedText type="small">This device: {session.status}, {session.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)} completed sets{ '\n' }Server: {row.conflict.status}, {row.conflict.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)} completed sets</ThemedText><Button title="Keep this device’s version" onPress={() => resolve(id, 'local')} /><Button title="Use server version" variant="secondary" onPress={() => resolve(id, 'server')} /></View>}
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
    {restUntil > now && <View style={{ gap: 8 }}><ThemedText type="smallBold">Rest · {Math.ceil((restUntil - now) / 1000)}s remaining</ThemedText><Button title="End rest" variant="secondary" onPress={() => { setRestUntil(0); writeLocal(user!._id, `rest:${id}`, 0); }} /></View>}
    {session.exercises.map((e, ei) => {
      const previous = sessions.filter(r => r.session._id !== id && r.session.status === 'finished' && r.session.startedAt < session.startedAt).sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt)).map(r => r.session.exercises.find(x => x.exerciseId === e.exerciseId)).find(Boolean);
      const alternatives = library.data?.filter(x => x.category === e.definition.category && x.tracking === e.definition.tracking && !user!.training.excludedExercises.includes(x.id) && x.equipment.every(eq => user!.training.equipment.includes(eq as 'dumbbells' | 'bench' | 'cable_machine' | 'stationary_bike')));
      return <View key={ei} style={{ padding: 16, borderRadius: 16, backgroundColor: theme.backgroundElement, gap: 10 }}>
        <ThemedText type="smallBold">{e.definition.name}</ThemedText>{e.definition.instructions.map((s, i) => <ThemedText key={i} type="small" themeColor="textSecondary">{i + 1}. {s}</ThemedText>)}
        {previous && <ThemedText type="small">Previous: {previous.sets.filter(s => s.status === 'completed').map(s => e.definition.tracking === 'reps' ? `${s.reps} reps${s.weightKg !== null ? ` @ ${s.weightKg} kg` : ''}` : `${s.durationSeconds}s`).join(' · ') || 'No completed sets'}</ThemedText>}
        {e.sets.map((s, si) => <View key={si} style={{ gap: 8 }}>
          <ThemedText type="small">Set {si + 1} · {s.status}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {e.definition.tracking === 'reps' ? <><View style={{ flex: 1 }}><Input label="Actual reps" accessibilityLabel={`${e.definition.name} set ${si + 1} reps`} keyboardType="number-pad" value={s.reps?.toString() ?? ''} editable={editable} onChangeText={v => setNumber(ei, si, 'reps', v)} /></View>{!!e.definition.equipment.length && <View style={{ flex: 1 }}><Input label="Weight (kg, optional)" keyboardType="decimal-pad" value={s.weightKg?.toString() ?? ''} editable={editable} onChangeText={v => setNumber(ei, si, 'weightKg', v)} /></View>}</> : <><View style={{ flex: 1 }}><Input label="Actual seconds" keyboardType="number-pad" value={s.durationSeconds?.toString() ?? ''} editable={editable} onChangeText={v => setNumber(ei, si, 'durationSeconds', v)} /></View>{e.definition.category === 'cardio' && <View style={{ flex: 1 }}><Input label="Distance (km, optional)" keyboardType="decimal-pad" value={s.distanceKm?.toString() ?? ''} editable={editable} onChangeText={v => setNumber(ei, si, 'distanceKm', v)} /></View>}</>}
          </View>
          {editable && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip label={s.status === 'completed' ? 'Undo completion' : 'Complete set'} selected={s.status === 'completed'} onPress={() => {
            if (s.status !== 'completed' && (e.definition.tracking === 'reps' ? !s.reps : !s.durationSeconds)) { setError('Enter actual reps or duration before completing this set.'); return; }
            updateSet(ei, si, { status: s.status === 'completed' ? 'pending' : 'completed' });
            if (s.status !== 'completed') { const deadline = Date.now() + e.restSeconds * 1000; setRestUntil(deadline); writeLocal(user!._id, `rest:${id}`, deadline); }
          }} /><Chip label={s.status === 'skipped' ? 'Unskip' : 'Skip set'} selected={s.status === 'skipped'} onPress={() => updateSet(ei, si, { status: s.status === 'skipped' ? 'pending' : 'skipped' })} /></View>}
        </View>)}
        {editable && !e.sets.some(s => s.status === 'completed') && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{alternatives?.map(x => <Chip key={x.id} label={x.name} selected={x.id === e.exerciseId} onPress={() => save({ ...session, exercises: session.exercises.map((item, i) => i !== ei ? item : { exerciseId: x.id, definition: x, restSeconds: item.restSeconds, sets: item.sets.map(s => ({ ...s, weightKg: null })) }) })} />)}</View>}
      </View>;
    })}
    <Input label="Session notes" value={session.notes} onChangeText={notes => save({ ...session, notes })} editable={editable} maxLength={2000} />
    {editable && <><ThemedText type="smallBold">How did it feel?</ThemedText><ChipGroup options={['easy', 'right', 'hard'] as const} value={session.feedback} onChange={feedback => save({ ...session, feedback })} /><Button title="Finish workout (partial is OK)" onPress={finish} /><Button title="Discard workout" variant="danger" onPress={() => showAlert('Discard workout?', 'It will not count toward your progress.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { save({ ...session, status: 'discarded', finishedAt: new Date().toISOString() }); void sync(); } }])} /></>}
    <Button title={row.pending ? 'Saved locally · Sync now' : 'Synced · Refresh'} variant="secondary" onPress={() => void sync()} loading={syncing} />
  </Screen>;
}
