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
  const current = sessions.find(s => s.session.status === 'in_progress');
  const finished = sessions.filter(s => s.session.date === date && s.session.status === 'finished');
  return <View style={{ backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }}>
    <ThemedText type="smallBold">Today’s exercise</ThemedText>
    <ThemedText>{current ? 'Your workout is ready to resume' : day ? day.exercises.length ? day.title : 'Rest day' : user?.training.enabled ? 'Plan your next workout week' : 'Add exercise to your week'}</ThemedText>
    {day && <ThemedText type="small" themeColor="textSecondary">{day.explanation}</ThemedText>}
    {!!finished.length && <ThemedText type="small">{finished.length} workout{finished.length === 1 ? '' : 's'} completed today</ThemedText>}
    {plans.isError && !plans.data && <ThemedText type="small" themeColor="textSecondary">Couldn’t load the schedule. Your saved workouts are available in Exercise.</ThemedText>}
    <Button title={current ? 'Resume workout' : day?.exercises.length ? 'View workout' : 'Open exercise'} variant="secondary" onPress={() => current ? router.push({ pathname: '/workout/[id]', params: { id: current.session._id } }) : day?.exercises.length && active ? router.push({ pathname: '/training-plan/[id]', params: { id: active._id } }) : router.navigate('/exercise')} />
  </View>;
}
