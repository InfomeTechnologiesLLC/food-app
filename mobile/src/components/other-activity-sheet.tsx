import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useExercise, useExerciseLibrary } from '@/lib/exercise';
import type { ExerciseDefinition, SessionExercise } from '@/lib/exercise-types';
import { dailyWorkoutSession } from '@/lib/workout-tracking';

const MINUTES = [10, 15, 20, 30, 45, 60] as const;
const SETS = [1, 2, 3] as const;
const REPS = [8, 10, 12, 15] as const;

/**
 * "I did something else": logs an activity the user did instead of (or as well as) today's plan,
 * e.g. a 30-minute walk. It counts as today's workout.
 */
export function OtherActivitySheet({ visible, onClose, date, planId }: { visible: boolean; onClose: () => void; date: string; planId?: string }) {
  return (
    <BottomSheet visible={visible} title="Log another activity" subtitle="It counts as today’s workout." onClose={onClose}>
      {visible && <ActivityForm date={date} planId={planId} onDone={onClose} />}
    </BottomSheet>
  );
}

function ActivityForm({ date, planId, onDone }: { date: string; planId?: string; onDone: () => void }) {
  const { user } = useAuth();
  const library = useExerciseLibrary();
  const { sessions, save, start } = useExercise();
  const options = (library.data ?? []).filter((e) => e.equipment.every((eq) => user?.training.equipment.includes(eq as never)));
  // Cardio first: it's what people most often do instead
  const sorted = [...options.filter((e) => e.category === 'cardio'), ...options.filter((e) => e.category !== 'cardio')];
  const [choice, setChoice] = useState<ExerciseDefinition | null>(null);
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>(30);
  const [sets, setSets] = useState<(typeof SETS)[number]>(2);
  const [reps, setReps] = useState<(typeof REPS)[number]>(10);

  const add = () => {
    if (!choice) return;
    const timed = choice.tracking === 'duration';
    const exercise: SessionExercise = {
      exerciseId: choice.id, definition: choice, restSeconds: 60,
      sets: Array.from({ length: timed ? 1 : sets }, () => ({ reps: timed ? null : reps, weightKg: null, durationSeconds: timed ? minutes * 60 : null, distanceKm: null, status: 'completed' as const })),
    };
    try {
      const today = dailyWorkoutSession(sessions, date);
      if (today && today.session.status === 'in_progress') {
        save({ ...today.session, exercises: [...today.session.exercises, exercise] });
      } else {
        const day = { date, title: choice.name, explanation: '', exercises: [{ exerciseId: choice.id, sets: exercise.sets.length, repsMin: timed ? null : reps, repsMax: timed ? null : reps, durationSeconds: timed ? minutes * 60 : null, restSeconds: 60 }] };
        start(day, library.data ?? [], planId ?? null, (s) => ({ ...s, title: choice.name, exercises: [exercise] }));
      }
      onDone();
    } catch (e) {
      showAlert('Couldn’t save', (e as Error).message);
    }
  };

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">What did you do?</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {sorted.map((e) => <Chip key={e.id} label={e.name} selected={choice?.id === e.id} onPress={() => setChoice(e)} />)}
        </View>
      </View>
      {choice?.tracking === 'duration' && (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">For how long?</ThemedText>
          <ChipGroup options={MINUTES} value={minutes} onChange={setMinutes} format={(m) => `${m} min`} />
        </View>
      )}
      {choice?.tracking === 'reps' && (
        <>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Sets</ThemedText>
            <ChipGroup options={SETS} value={sets} onChange={setSets} format={(n) => `${n}`} />
          </View>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Reps in each set</ThemedText>
            <ChipGroup options={REPS} value={reps} onChange={setReps} format={(n) => `${n}`} />
          </View>
        </>
      )}
      <Button title="Save activity" icon="checkmark" onPress={add} disabled={!choice} />
    </View>
  );
}
