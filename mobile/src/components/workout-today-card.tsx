import { router } from 'expo-router';
import { View } from 'react-native';
import { ThemedText } from './themed-text';
import { Button } from './ui';
import { useExercise, useWorkoutPlans } from '@/lib/exercise';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/use-theme';
export function WorkoutTodayCard({ date }: { date: string }) {
  const { user } = useAuth(); const theme = useTheme();
  const plans = useWorkoutPlans(); const { sessions } = useExercise();
  const active = plans.data?.find(p => p.status === 'active'); const day = active?.days.find(d => d.date === date);
  const completedSets = sessions.filter(s => s.session.date === date).reduce((total, s) => total + s.session.exercises.reduce((count, e) => count + e.sets.filter(set => set.status === 'completed').length, 0), 0);
  return <View style={{ backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }}>
    <ThemedText type="smallBold">Today’s exercise</ThemedText>
    <ThemedText>{day ? day.exercises.length ? day.title : 'Rest day' : user?.training.enabled ? 'Plan your next workout week' : 'Add exercise to your week'}</ThemedText>
    {day && <ThemedText type="small" themeColor="textSecondary">{day.explanation}</ThemedText>}
    {!!completedSets && <ThemedText type="small">{completedSets} set{completedSets === 1 ? '' : 's'} completed today</ThemedText>}
    {plans.isError && !plans.data && <ThemedText type="small" themeColor="textSecondary">Couldn’t load the schedule. Your saved workouts are available in Exercise.</ThemedText>}
    <Button title={day?.exercises.length ? 'View workout' : 'Open exercise'} variant="secondary" onPress={() => day?.exercises.length && active ? router.push({ pathname: '/training-plan/[id]', params: { id: active._id } }) : router.navigate('/exercise')} />
  </View>;
}
