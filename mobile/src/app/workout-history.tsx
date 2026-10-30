import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useExercise } from '@/lib/exercise';
import type { WorkoutSession } from '@/lib/exercise-types';
import { dateLabel, localDate } from '@/lib/plans';
import { completedSets } from '@/lib/progress-core';

const FEEDBACK = { easy: 'Felt easy', right: 'Felt just right', hard: 'Felt hard' } as const;

/** Minutes of timed work (walks, planks…) in a session. */
const timedMinutes = (s: WorkoutSession) => Math.round(s.exercises.reduce((n, e) => n + e.sets.reduce((m, x) => m + (x.status === 'completed' ? x.durationSeconds ?? 0 : 0), 0), 0) / 60);

/**
 * Every workout the user did, newest first and grouped by day: today's too (a workout only counts
 * as "finished" once its day is over, so status alone would hide it). Sessions with nothing done are left out.
 */
export default function WorkoutHistory() {
  const theme = useTheme();
  const { user } = useAuth();
  const { sessions, importSession } = useExercise();
  const history = useInfiniteQuery({
    queryKey: ['exercise', user?._id, 'history'], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<{ entries: WorkoutSession[]; nextCursor: string | null }>(`/exercise/sessions?${new URLSearchParams(pageParam ? { cursor: pageParam } : {})}`),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const merged = new Map(history.data?.pages.flatMap((p) => p.entries).map((s) => [s._id, s]));
  for (const row of sessions) merged.set(row.session._id, row.session); // not yet synced ones too
  const entries = [...merged.values()].filter((s) => completedSets(s) > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  const days = [...new Set(entries.map((s) => s.date))];
  const today = localDate();
  const totalSets = entries.reduce((n, s) => n + completedSets(s), 0);

  return (
    <Screen edges={['bottom']}>
      {history.isLoading && !entries.length ? <ActivityIndicator color={theme.tint} /> : !entries.length ? (
        <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="barbell-outline" size={32} color={theme.tint} />
          <ThemedText style={{ fontWeight: 700 }}>No workouts yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Complete a set, tap “Mark workout as done”, or log another activity, and it shows here.</ThemedText>
          <Button title="Go to Exercise" variant="secondary" onPress={() => router.navigate('/exercise')} />
        </View>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.statValue}>{days.length}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{days.length === 1 ? 'day trained' : 'days trained'}</ThemedText>
            </View>
            <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.statValue}>{totalSets}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">sets completed</ThemedText>
            </View>
          </View>
          {days.map((date) => (
            <View key={date} style={{ gap: Spacing.two }}>
              <ThemedText type="smallBold" themeColor="textSecondary">{date === today ? 'Today' : dateLabel(date)}</ThemedText>
              {entries.filter((s) => s.date === date).map((s) => {
                const sets = completedSets(s);
                const minutes = timedMinutes(s);
                const names = s.exercises.filter((e) => e.sets.some((x) => x.status === 'completed')).map((e) => e.definition?.name ?? e.exerciseId);
                return (
                  <Pressable key={s._id} accessibilityRole="button" accessibilityLabel={`${s.title}, ${sets} sets`}
                    onPress={() => { importSession(s); router.push({ pathname: '/workout/[id]', params: { id: s._id } }); }}
                    style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
                    <View style={[styles.icon, { backgroundColor: `${theme.tint}1F` }]}>
                      <Ionicons name="checkmark-done" size={20} color={theme.tint} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText style={{ fontWeight: 700 }}>{s.title}</ThemedText>
                      {names.join(' · ') !== s.title && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{names.join(' · ')}</ThemedText>}
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                        {sets} {sets === 1 ? 'set' : 'sets'}{minutes ? ` · ${minutes} min` : ''}{s.feedback ? ` · ${FEEDBACK[s.feedback]}` : ''}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          ))}
          {history.hasNextPage && <Button title="Load earlier workouts" variant="secondary" onPress={() => void history.fetchNextPage()} loading={history.isFetchingNextPage} />}
        </>
      )}
      {history.isError && <ThemedText type="small" themeColor="textSecondary">Offline or unable to load history. Workouts saved on this phone are shown.</ThemedText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four, borderRadius: 20 },
  summary: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 16, padding: Spacing.three, gap: 2 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 16, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
