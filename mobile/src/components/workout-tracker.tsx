import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';
import { Button, Input } from './ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExercise, useExerciseLibrary } from '@/lib/exercise';
import { prescribedExercises, patchWorkoutSet, workoutProgress, isSetUnlocked, workoutDate } from '@/lib/workout-tracking';
import { readLocal, writeLocal } from '@/lib/local-store';
import type { LocalSession, SetLog, WorkoutDay, WorkoutSession } from '@/lib/exercise-types';

/** Completes every remaining set with its planned reps or time (sets without them stay as they are). */
function markAllDone(s: WorkoutSession): WorkoutSession {
  return { ...s, exercises: s.exercises.map((e) => ({ ...e, sets: e.sets.map((set) => {
    const hasAmount = e.definition.tracking === 'reps' ? set.reps : set.durationSeconds;
    return set.status === 'pending' && hasAmount ? { ...set, status: 'completed' as const } : set;
  }) })) };
}

/** `onChangeExercise` lets the coach swap an exercise in the plan; only offered before the workout is started. */
export function WorkoutTracker({ row, day, planId, onChangeExercise }: { row?: LocalSession; day?: WorkoutDay; planId?: string; onChangeExercise?: (index: number) => void }) {
  const theme = useTheme();
  const { user, needsSignIn } = useAuth();
  const { save, start, resolve } = useExercise();
  const library = useExerciseLibrary();
  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const restKey = `rest:${row?.session._id ?? ''}`;
  const [restUntil, setRestUntil] = useState(() => user ? readLocal<number>(user._id, restKey) ?? 0 : 0);
  // Tick every second only while a rest timer is running; otherwise once a minute (for the end of the day)
  const resting = restUntil > now;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), resting ? 1000 : 60000);
    return () => clearInterval(timer);
  }, [resting]);
  const missing = !row && day?.exercises.some(p => !library.data?.some(e => e.id === p.exerciseId));
  // Preview uses the same targets as ExerciseProvider.start, without saving a session.
  const preview: WorkoutSession | undefined = !row && day ? {
    _id: '', revision: 0, planId: planId ?? null, scheduledDate: day.date, date: day.date,
    timezone: '', title: day.title, startedAt: '', finishedAt: null, status: 'in_progress', notes: '', feedback: null,
    exercises: missing ? [] : prescribedExercises(day, library.data ?? []),
  } : undefined;
  const session = row?.session ?? preview;
  if (!session || !user) return null;
  const editable = session.date === workoutDate(session, new Date(now)) && !row?.conflict && !missing;
  const { total, completed, skipped } = workoutProgress(session);
  const mutate = (update: (s: WorkoutSession) => WorkoutSession): string | undefined => {
    if (!editable) return;
    try {
      setError('');
      if (row) { save(update(session)); return session._id; }
      if (day && planId) return start(day, library.data ?? [], planId, update);
    } catch (e) { setError((e as Error).message); }
  };
  const updateSet = (ei: number, si: number, patch: Partial<SetLog>) => mutate(s => patchWorkoutSet(s, ei, si, patch));
  const handleToggle = (ei: number, si: number, tappedAt: number) => {
    const e = session.exercises[ei]; const set = e.sets[si];
    if (set.status !== 'completed' && !isSetUnlocked(e, si)) return;
    if (set.status !== 'completed' && !(e.definition.tracking === 'reps' ? set.reps : set.durationSeconds)) {
      setOpen(ei); setEditing(ei); setError('Enter actual reps or duration before completing this set.'); return;
    }
    const id = updateSet(ei, si, { status: set.status === 'completed' ? 'pending' : 'completed' });
    if (id) {
      const deadline = set.status === 'completed' ? 0 : tappedAt + e.restSeconds * 1000;
      setRestUntil(deadline); writeLocal(user._id, `rest:${id}`, deadline);
    }
  };
  const number = (ei: number, si: number, key: 'reps' | 'weightKg' | 'durationSeconds' | 'distanceKm', text: string) => {
    const value = text.trim() ? Number(text.replace(',', '.')) : null;
    const max = { reps: 200, weightKg: 500, durationSeconds: 86400, distanceKm: 1000 }[key];
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max || ((key === 'reps' || key === 'durationSeconds') && (!Number.isInteger(value) || value < 1)))) {
      setError('Enter a valid positive rep count or duration, or a non-negative weight or distance.'); return;
    }
    updateSet(ei, si, { [key]: value });
  };
  return <View style={styles.container}>
    <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="subtitle">{session.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{!row || session.date === workoutDate(session, new Date(now)) ? 'Today' : session.date}</ThemedText>
      {editable && <ThemedText type="small" themeColor="textSecondary">Changes save automatically. Editable until the day ends.</ThemedText>}
      <ThemedText type="smallBold">{missing ? 'Exercise details unavailable' : `${completed} / ${total} sets completed${skipped ? ` · ${skipped} skipped` : ''}`}</ThemedText>
      {editable && !missing && total > 0 && completed + skipped < total && (
        <Button title="Mark workout as done" icon="checkmark-done-outline" onPress={() => mutate(markAllDone)} />
      )}
      {!missing && total > 0 && completed + skipped === total && <ThemedText type="smallBold" themeColor="tint">Workout done. Great job!</ThemedText>}
      {!missing && <View accessibilityRole="progressbar" accessibilityLabel="Workout sets completed" accessibilityValue={{ min: 0, max: total, now: completed }} style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.track, { width: `${total ? completed / total * 100 : 0}%`, backgroundColor: theme.tint }]} />
      </View>}
    </View>
    {missing && <><ThemedText themeColor="textSecondary">{library.isLoading ? 'Loading exercise instructions…' : 'Reconnect to load exercise instructions before logging.'}</ThemedText><Button title="Retry instructions" variant="secondary" onPress={() => void library.refetch()} /></>}
    {needsSignIn && <ThemedText themeColor="danger">Saved on this device. Sign in again from Exercise to sync.</ThemedText>}
    {!!row?.error && <ThemedText themeColor="danger">{row.error}</ThemedText>}
    {row?.conflict && <View style={styles.container}>
      <ThemedText type="smallBold">Choose which version to keep</ThemedText>
      <ThemedText type="small">This device: {session.status}, {completed} completed sets. Server: {row.conflict.status}, {row.conflict.exercises.flatMap(e => e.sets).filter(s => s.status === 'completed').length} completed sets.</ThemedText>
      <Button title="Keep this device’s version" onPress={() => resolve(session._id, 'local')} />
      <Button title="Use server version" variant="secondary" onPress={() => resolve(session._id, 'server')} />
    </View>}
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
    {editable && restUntil > now && <View style={[styles.rest, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">Rest · {Math.ceil((restUntil - now) / 1000)}s</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="End rest" style={styles.touch} onPress={() => { setRestUntil(0); writeLocal(user._id, restKey, 0); }}><ThemedText themeColor="tint">End rest</ThemedText></Pressable>
    </View>}
    {session.exercises.map((e, ei) => {
      const done = e.sets.every(s => s.status === 'completed');
      const alternatives = library.data?.filter(x => x.id !== e.exerciseId && x.category === e.definition.category && x.tracking === e.definition.tracking && !user.training.excludedExercises.includes(x.id) && x.equipment.every(eq => user.training.equipment.includes(eq as typeof user.training.equipment[number])) && !session.exercises.some((other, i) => i !== ei && other.exerciseId === x.id));
      return <View key={ei} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: done ? theme.tint : theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${e.definition.name}, ${done ? 'done, ' : ''}${open === ei ? 'hide' : 'show'} details`} accessibilityState={{ expanded: open === ei }} onPress={() => { setOpen(open === ei ? null : ei); setEditing(null); }} style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}><ThemedText type="smallBold">{e.definition.name}{done ? ' · Done' : ''}</ThemedText><ThemedText type="small" themeColor="textSecondary">{e.sets.length} {e.sets.length === 1 ? 'set' : 'sets'} · {e.sets.map(s => e.definition.tracking === 'reps' ? `${s.reps ?? '–'} reps` : s.durationSeconds && s.durationSeconds >= 120 ? `${Math.round(s.durationSeconds / 60)} min` : `${s.durationSeconds ?? '–'}s`).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</ThemedText></View>
          <Ionicons name={open === ei ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
        </Pressable>
        <View style={styles.sets}>{e.sets.map((s, si) => <Pressable key={si} accessibilityRole="checkbox" accessibilityState={{ checked: s.status === 'completed', disabled: !editable || (s.status !== 'completed' && !isSetUnlocked(e, si)) }} accessibilityLabel={`${e.definition.name}, set ${si + 1}, ${s.status}${s.status !== 'completed' && !isSetUnlocked(e, si) ? ', locked' : ''}, ${e.definition.tracking === 'reps' ? `${s.reps ?? 'no'} reps` : `${s.durationSeconds ?? 'no'} seconds`}`} disabled={!editable || (s.status !== 'completed' && !isSetUnlocked(e, si))} onPress={() => handleToggle(ei, si, Date.now())} style={({ pressed }) => [styles.set, { backgroundColor: s.status === 'completed' ? theme.tint : theme.backgroundSelected, borderColor: s.status === 'skipped' ? theme.warning : theme.border, opacity: s.status !== 'completed' && !isSetUnlocked(e, si) ? 0.4 : pressed ? 0.7 : 1 }]}>
          <Ionicons name={s.status === 'completed' ? 'checkmark' : s.status === 'skipped' ? 'play-skip-forward-outline' : !isSetUnlocked(e, si) ? 'lock-closed-outline' : 'ellipse-outline'} size={20} color={s.status === 'completed' ? theme.tintText : theme.textSecondary} />
          <ThemedText type="smallBold" style={{ color: s.status === 'completed' ? theme.tintText : theme.text }}>Set {si + 1}</ThemedText>
        </Pressable>)}</View>
        {open === ei && <View style={styles.container}>
          {e.definition.instructions.map((instruction, i) => <ThemedText key={i} type="small" themeColor="textSecondary">{i + 1}. {instruction}</ThemedText>)}
          {!row && onChangeExercise && <Button title="Change this exercise" icon="swap-horizontal" variant="secondary" onPress={() => onChangeExercise(ei)} />}
          {editable && <Button title={editing === ei ? 'Done editing' : 'Edit sets'} icon={editing === ei ? 'checkmark' : 'create-outline'} variant="secondary" onPress={() => setEditing(editing === ei ? null : ei)} />}
          {editing === ei && editable && <ThemedText type="small" themeColor="textSecondary">Changes save automatically.</ThemedText>}
          {e.sets.map((s, si) => <View key={si} style={styles.container}>
            <ThemedText type="smallBold">Set {si + 1} · {s.status}</ThemedText>
            {editing === ei && editable ? <>
            <Input label={e.definition.tracking === 'reps' ? 'Actual reps' : 'Actual seconds'} accessibilityLabel={`${e.definition.name} set ${si + 1} actual ${e.definition.tracking === 'reps' ? 'reps' : 'seconds'}`} keyboardType="number-pad" editable={editable} value={(e.definition.tracking === 'reps' ? s.reps : s.durationSeconds)?.toString() ?? ''} onChangeText={v => number(ei, si, e.definition.tracking === 'reps' ? 'reps' : 'durationSeconds', v)} />
            {e.definition.tracking === 'reps' && !!e.definition.equipment.length && <Input label="Weight (kg, optional)" keyboardType="decimal-pad" editable={editable} value={s.weightKg?.toString() ?? ''} onChangeText={v => number(ei, si, 'weightKg', v)} />}
            {e.definition.category === 'cardio' && <Input label="Distance (km, optional)" keyboardType="decimal-pad" editable={editable} value={s.distanceKm?.toString() ?? ''} onChangeText={v => number(ei, si, 'distanceKm', v)} />}
            </> : <ThemedText type="small" themeColor="textSecondary">{e.definition.tracking === 'reps' ? `${s.reps ?? '–'} reps${s.weightKg !== null ? ` · ${s.weightKg} kg` : ''}` : `${s.durationSeconds ?? '–'} seconds`}{e.definition.category === 'cardio' && s.distanceKm !== null ? ` · ${s.distanceKm} km` : ''}</ThemedText>}
            {editing === ei && editable && <Button title={s.status === 'skipped' ? 'Unskip set' : 'Skip set'} disabled={s.status === 'pending' && !isSetUnlocked(e, si)} variant="secondary" onPress={() => updateSet(ei, si, { status: s.status === 'skipped' ? 'pending' : 'skipped' })} />}
          </View>)}
          {editing === ei && editable && !e.sets.some(s => s.status === 'completed') && !!alternatives?.length && <><ThemedText type="smallBold">Swap exercise</ThemedText>{alternatives.map(x => <Button key={x.id} title={x.name} variant="secondary" onPress={() => mutate(s => ({ ...s, exercises: s.exercises.map((item, i) => i !== ei ? item : { ...item, exerciseId: x.id, definition: x, sets: item.sets.map(set => ({ ...set, weightKg: null })) }) }))} />)}</>}
        </View>}
      </View>;
    })}
    {row && <>
      <Button title={details ? 'Hide workout details' : 'Notes and workout details'} variant="secondary" onPress={() => { setDetails(!details); setEditingNotes(false); }} />
      {details && <View style={styles.container}>
        {editingNotes && editable ? <Input label="Session notes" value={session.notes} maxLength={2000} onChangeText={notes => mutate(s => ({ ...s, notes }))} /> : <ThemedText type="small" themeColor="textSecondary">{session.notes || 'No session notes'}</ThemedText>}
        {editable && <Button title={editingNotes ? 'Done editing notes' : 'Edit notes'} variant="secondary" onPress={() => setEditingNotes(!editingNotes)} />}
        {editable ? <><ThemedText type="smallBold">How did it feel?</ThemedText><View style={styles.sets}>{(['easy', 'right', 'hard'] as const).map(feedback => <Pressable key={feedback} accessibilityRole="button" accessibilityState={{ selected: session.feedback === feedback }} onPress={() => mutate(s => ({ ...s, feedback }))} style={[styles.set, { backgroundColor: session.feedback === feedback ? theme.tint : theme.backgroundSelected, borderColor: theme.border }]}><ThemedText style={{ color: session.feedback === feedback ? theme.tintText : theme.text }}>{feedback === 'right' ? 'Just right' : feedback === 'easy' ? 'Easy' : 'Hard'}</ThemedText></Pressable>)}</View></> : session.feedback && <ThemedText type="small">Feedback: {session.feedback}</ThemedText>}
      </View>}
      {row.pending && <ThemedText type="small" themeColor="textSecondary">Saved on this device · syncs automatically when connected</ThemedText>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 12 }, summary: { padding: 16, borderRadius: 20, gap: 10 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  sets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  set: { minHeight: 48, minWidth: 80, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12 },
  rest: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderRadius: 12 },
  touch: { minHeight: 44, justifyContent: 'center' },
});
