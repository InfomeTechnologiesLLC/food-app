import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { useExercise } from '@/lib/exercise';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { WorkoutSession } from '@/lib/exercise-types';
export default function WorkoutHistory() {
  const { user } = useAuth(); const { sessions, importSession } = useExercise();
  const history = useInfiniteQuery({ queryKey: ['exercise', user?._id, 'history'], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<{ entries: WorkoutSession[]; nextCursor: string | null }>(`/exercise/sessions?${new URLSearchParams(pageParam ? { cursor: pageParam } : {})}`), getNextPageParam: page => page.nextCursor ?? undefined });
  const merged = new Map(history.data?.pages.flatMap(p => p.entries).map(s => [s._id, s]));
  for (const row of sessions) merged.set(row.session._id, row.session);
  const entries = [...merged.values()].filter(s => s.status !== 'discarded').sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  return <Screen edges={['bottom']}>{entries.map(s => <View key={s._id} style={{ gap: 8 }}><ThemedText type="smallBold">{s.title}</ThemedText><ThemedText type="small">{s.date} · {s.status === 'finished' ? 'Completed' : 'In progress'} · {s.exercises.reduce((n, e) => n + e.sets.filter(x => x.status === 'completed').length, 0)} completed sets</ThemedText><Button title="View session" variant="secondary" onPress={() => { importSession(s); router.push({ pathname: '/workout/[id]', params: { id: s._id } }); }} /></View>)}{history.hasNextPage && <Button title="Load earlier sessions" onPress={() => void history.fetchNextPage()} loading={history.isFetchingNextPage} />}{history.isError && <ThemedText themeColor="textSecondary">Offline or unable to load history. Saved sessions are shown.</ThemedText>}</Screen>;
}
