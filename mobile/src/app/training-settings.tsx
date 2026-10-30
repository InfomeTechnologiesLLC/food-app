import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Section, humanize } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useExerciseLibrary } from '@/lib/exercise';
import { DEFAULT_TRAINING, type TrainingPreferences } from '@/lib/exercise-types';
import { useAutoWorkoutWeek } from '@/lib/auto-week';
import { showAlert } from '@/components/themed-alert';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function TrainingSettings() {
  const { user, updateTraining } = useAuth();
  const library = useExerciseLibrary();
  const week = useAutoWorkoutWeek();
  const [draft, setDraft] = useState<TrainingPreferences>(user?.training ?? DEFAULT_TRAINING);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const set = <K extends keyof TrainingPreferences>(key: K, value: TrainingPreferences[K]) => setDraft(p => ({ ...p, [key]: value }));
  const save = async () => {
    setSaving(true); setError('');
    try {
      if (!draft.weekdays.length) throw new Error('Choose at least one training day.');
      const before = user?.training;
      await updateTraining(draft);
      router.back();
      // Days, length, equipment or goal changed while a week is planned: offer to plan it again to match
      const changed = before && draft.enabled && JSON.stringify({ ...before, excludedExercises: [] }) !== JSON.stringify({ ...draft, excludedExercises: [] });
      if (changed && user?.trainingDaysChosen) {
        showAlert('Update this week’s workouts?', 'Your coach can plan this week again to match your new settings. Workouts you already did are kept.', [
          { text: 'Not now', style: 'cancel' }, { text: 'Update', onPress: week.replan },
        ]);
      }
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return <Screen edges={['bottom']}>
    <ThemedText themeColor="textSecondary">AI uses these alongside your optional body measurements to generate a workout week. Change measurements in Profile.</ThemedText>
    <Section title="Exercise planning"><ChipGroup options={['enabled', 'disabled'] as const} value={draft.enabled ? 'enabled' : 'disabled'} onChange={v => set('enabled', v === 'enabled')} format={humanize} /></Section>
    <Section title="Training goal"><ChipGroup options={['general_fitness', 'strength', 'muscle_gain', 'endurance'] as const} value={draft.goal} onChange={v => set('goal', v)} format={humanize} /></Section>
    <Section title="Experience"><ChipGroup options={['beginner', 'intermediate'] as const} value={draft.experience} onChange={v => set('experience', v)} format={humanize} /></Section>
    <Section title="Available equipment (none means bodyweight)"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['dumbbells', 'bench', 'cable_machine', 'stationary_bike'] as const).map(e => <Chip key={e} label={humanize(e)} selected={draft.equipment.includes(e)} onPress={() => set('equipment', draft.equipment.includes(e) ? draft.equipment.filter(x => x !== e) : [...draft.equipment, e])} />)}</View></Section>
    <Section title="Exercise days"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{DAYS.map((name, day) => <Chip key={day} label={name} selected={draft.weekdays.includes(day)} onPress={() => set('weekdays', draft.weekdays.includes(day) ? draft.weekdays.filter(x => x !== day) : [...draft.weekdays, day])} />)}</View></Section>
    <Section title="Session length (minutes)"><ChipGroup options={[15, 20, 30, 45, 60]} value={draft.sessionMinutes} onChange={v => set('sessionMinutes', v)} /></Section>
    <Section title="Exercises to exclude"><ThemedText type="small" themeColor="textSecondary">Select movements you do not want included.</ThemedText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{library.data?.map(e => <Chip key={e.id} label={e.name} selected={draft.excludedExercises.includes(e.id)} onPress={() => set('excludedExercises', draft.excludedExercises.includes(e.id) ? draft.excludedExercises.filter(x => x !== e.id) : [...draft.excludedExercises, e.id])} />)}</View>{library.isError && <ThemedText themeColor="danger">Reconnect to load the exercise library.</ThemedText>}</Section>
    {!!error && <ThemedText themeColor="danger">{error}</ThemedText>}<Button title="Save training preferences" onPress={save} loading={saving} />
  </Screen>;
}
