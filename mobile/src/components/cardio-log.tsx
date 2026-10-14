import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup, Input } from '@/components/ui';
import { showAlert } from '@/components/themed-alert';
import { useTheme } from '@/hooks/use-theme';
import type { ExerciseDefinition, LocalSession, WorkoutSession } from '@/lib/exercise-types';

export function CardioLog({ row, library, save, sync, syncing, needsSignIn }: {
  row: LocalSession;
  library: ExerciseDefinition[];
  save: (session: WorkoutSession) => void;
  sync: () => Promise<void>;
  syncing: boolean;
  needsSignIn: boolean;
}) {
  const theme = useTheme();
  const { session } = row;
  const exercise = session.exercises[0];
  const set = exercise.sets[0];
  const [minutes, setMinutes] = useState(String((set.durationSeconds ?? 600) / 60));
  const [distance, setDistance] = useState(set.distanceKm?.toString() ?? '');
  const [details, setDetails] = useState(false);
  const [error, setError] = useState('');
  const editable = session.status === 'in_progress';
  const activities = library.filter(e => e.category === 'cardio' && e.tracking === 'duration');
  const finish = () => {
    const seconds = Math.round(Number(minutes.replace(',', '.')) * 60);
    const km = distance.trim() ? Number(distance.replace(',', '.')) : null;
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) {
      setError('Enter a duration between 1 second and 1,440 minutes.'); return;
    }
    if (km !== null && (!Number.isFinite(km) || km < 0 || km > 1000)) {
      setError('Enter a distance between 0 and 1,000 km, or leave it blank.'); return;
    }
    setError('');
    save({ ...session, status: 'finished', finishedAt: new Date().toISOString(), exercises: [{
      ...exercise, sets: [{ ...set, durationSeconds: seconds, distanceKm: km, status: 'completed' }],
    }] });
    void sync();
    router.replace('/(tabs)/exercise');
  };
  return <Screen edges={['bottom']}>
    {!editable && <ThemedText type="subtitle">{session.status === 'finished' ? 'Activity saved' : 'Activity discarded'}</ThemedText>}
    {!editable && <ThemedText themeColor="textSecondary">{session.date}</ThemedText>}
    <View style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 20, gap: 16 }}>
      {editable ? <>
        <ThemedText type="smallBold">What did you do?</ThemedText>
        <ChipGroup options={activities.length ? activities.map(e => e.id) : [exercise.exerciseId]} value={exercise.exerciseId}
          format={id => activities.find(e => e.id === id)?.name ?? exercise.definition.name}
          onChange={id => {
            const definition = activities.find(e => e.id === id);
            if (definition) save({ ...session, title: definition.name, exercises: [{ ...exercise, exerciseId: id, definition }] });
          }} />
        <Input label="How many minutes?" accessibilityLabel="Activity duration in minutes" keyboardType="decimal-pad" value={minutes}
          style={{ borderColor: `${theme.textSecondary}66`, borderWidth: 1 }}
          onChangeText={value => {
            setMinutes(value); setError('');
            const seconds = Math.round(Number(value.replace(',', '.')) * 60);
            if (value.trim() && Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400) {
              save({ ...session, exercises: [{ ...exercise, sets: [{ ...set, durationSeconds: seconds }] }] });
            }
          }} />
        <ChipGroup options={[10, 20, 30, 45, 60]} value={Number(minutes.replace(',', '.'))} format={n => `${n} min`}
          onChange={n => {
            setMinutes(String(n)); setError('');
            save({ ...session, exercises: [{ ...exercise, sets: [{ ...set, durationSeconds: n * 60 }] }] });
          }} />
      </> : <>
        <ThemedText type="smallBold">{exercise.definition.name}</ThemedText>
        <ThemedText type="title">{Math.round((set.durationSeconds ?? 0) / 60 * 10) / 10} min</ThemedText>
        {set.distanceKm !== null && <ThemedText>{set.distanceKm} km</ThemedText>}
        {!!session.notes && <ThemedText>{session.notes}</ThemedText>}
      </>}
    </View>
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}
    {editable && <>
      <Button title={details ? 'Hide optional details' : 'Add distance or notes (optional)'} variant="secondary" onPress={() => setDetails(!details)} />
      {details && <>
        <Input label="Distance (km)" keyboardType="decimal-pad" value={distance} onChangeText={value => {
          setDistance(value);
          const km = value.trim() ? Number(value.replace(',', '.')) : null;
          if (km === null || (Number.isFinite(km) && km >= 0 && km <= 1000)) {
            save({ ...session, exercises: [{ ...exercise, sets: [{ ...set, distanceKm: km }] }] });
          }
        }} />
        <Input label="Notes" value={session.notes} maxLength={2000} onChangeText={notes => save({ ...session, notes })} />
      </>}
      <Button title="Save activity" icon="checkmark-outline" onPress={finish} />
      <Button title="Discard activity" variant="danger" onPress={() => showAlert('Discard activity?', 'This activity will not count toward your progress.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { save({ ...session, status: 'discarded', finishedAt: new Date().toISOString() }); void sync(); } },
      ])} />
    </>}
    {!editable && <Button title="Done" onPress={() => router.replace('/(tabs)/exercise')} />}
    <ThemedText type="small" themeColor="textSecondary">{needsSignIn ? 'Saved on this device. Sign in again from Exercise to sync.' : row.pending ? 'Saved on this device. Syncs automatically when connected.' : 'Synced to your account.'}</ThemedText>
    {!!row.error && <><ThemedText themeColor="danger">{row.error}</ThemedText><Button title="Retry sync" variant="secondary" loading={syncing} onPress={() => void sync()} /></>}
  </Screen>;
}
