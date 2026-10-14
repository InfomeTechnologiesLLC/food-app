import { useLocalSearchParams } from 'expo-router';
import { WorkoutTracker } from '@/components/workout-tracker';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useExercise } from '@/lib/exercise';

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessions } = useExercise();
  const row = sessions.find(r => r.session._id === id);
  if (!row) return <Screen edges={['bottom']}><ThemedText>Saved workout unavailable.</ThemedText></Screen>;
  return <Screen edges={['bottom']}><WorkoutTracker key={id} row={row} /></Screen>;
}
