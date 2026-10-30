import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ExerciseChangeSheet, type ExerciseToChange } from '@/components/exercise-change-sheet';
import { ExerciseDaysCard } from '@/components/exercise-days-card';
import { FloatingActions } from '@/components/floating-actions';
import { OtherActivitySheet } from '@/components/other-activity-sheet';
import { Screen } from '@/components/screen';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { WorkoutTracker } from '@/components/workout-tracker';
import { Spacing } from '@/constants/theme';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useExercise, useExerciseLibrary, useWorkoutPlans } from '@/lib/exercise';
import type { WorkoutDay } from '@/lib/exercise-types';
import { useAutoWorkoutWeek } from '@/lib/auto-week';
import { usePeriod } from '@/lib/period';
import { dateLabel } from '@/lib/plans';
import { useTargets } from '@/lib/targets';
import { completedSets } from '@/lib/progress-core';
import { dailyWorkoutSession } from '@/lib/workout-tracking';

/** What the generated week focuses on, from the user's body goal (the server uses the same goal). */
const FOCUS = {
  lose: { icon: 'local-fire-department', title: 'Lose fat', text: 'Full-body sessions with some cardio, keeping strength work so you keep muscle.' },
  gain: { icon: 'fitness-center', title: 'Build muscle', text: 'Strength exercises for every major muscle, getting a little harder each week.' },
  maintain: { icon: 'directions-run', title: 'Stay fit', text: 'A balance of strength, mobility and cardio.' },
} as const;
/** A gentle session offered on period days instead of the planned workout. */
const GENTLE = [
  { exerciseId: 'walk', sets: 1, repsMin: null, repsMax: null, durationSeconds: 900, restSeconds: 30 },
  { exerciseId: 'bird-dog', sets: 2, repsMin: 6, repsMax: 8, durationSeconds: null, restSeconds: 45 },
  { exerciseId: 'glute-bridge', sets: 2, repsMin: 8, repsMax: 10, durationSeconds: null, restSeconds: 45 },
];
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const dayNumber = (date: string) => new Date(`${date}T12:00:00`).getDate();

/**
 * Exercise: the coach plans a week for the user's goal by itself (and the next one when it ends).
 * Each day can be opened from the strip; exercises can be changed by asking the coach, and
 * anything else the user did is logged with "I did something else".
 */
export default function ExerciseScreen() {
  const { user, needsSignIn } = useAuth();
  const plans = useWorkoutPlans();
  const library = useExerciseLibrary();
  const { sessions, start } = useExercise();
  const theme = useTheme();
  const today = useCalendarDate();
  const targets = useTargets();
  const period = usePeriod(today);
  // No week for today (none yet, or the last one ended): the coach plans one without being asked
  const week = useAutoWorkoutWeek();
  const [selectedDate, setSelectedDate] = useState(today);
  const [changing, setChanging] = useState<ExerciseToChange | null>(null);
  const [logging, setLogging] = useState(false);

  const direction = targets.data?.ready ? targets.data.direction
    : user?.preferences.goal === 'weight_loss' ? 'lose' : user?.preferences.goal === 'muscle_gain' ? 'gain' : 'maintain';
  const focus = FOCUS[direction];
  const active = plans.data?.find(p => p.status === 'active');
  const weekEnded = !!active && active.days.every(d => d.date < today);
  const day = active?.days.find(d => d.date === selectedDate);
  const isToday = selectedDate === today;
  const row = isToday ? dailyWorkoutSession(sessions, today, active?._id) : undefined;
  const onPeriod = !!period.data?.settings.tracking && !!period.data.status.onPeriod;
  const periodMode = onPeriod ? period.data!.settings.exercise : null;
  // Period day set to rest: no workout today unless one was already started
  const restToday = isToday && periodMode === 'rest' && !row;

  // Exercise off, or days not picked yet: ask which days first, then the week is planned on them
  const askDays = !user?.training.enabled || !user.trainingDaysChosen;
  /** After the days are saved: re-plan a running week so it follows them; otherwise the automatic week starts now. */
  const daysSaved = () => { if (active && !weekEnded) week.replan(); setSelectedDate(today); };

  const startGentle = () => {
    const available = GENTLE.filter(g => library.data?.some(e => e.id === g.exerciseId));
    const gentle: WorkoutDay = { date: today, title: 'Gentle session', explanation: 'A light walk and easy movements for a period day.', exercises: available };
    try {
      const id = start(gentle, library.data ?? [], active?._id ?? null);
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch (e) { showAlert('Couldn’t start', (e as Error).message); }
  };
  const changeExercise = (date: string, index: number) => {
    const exercise = active?.days.find(d => d.date === date)?.exercises[index];
    if (!active || !exercise) return;
    setChanging({ plan: active, date, index, name: library.data?.find(e => e.id === exercise.exerciseId)?.name ?? 'this exercise' });
  };
  const dayDone = (date: string) => sessions.some(r => r.session.date === date && completedSets(r.session) > 0);
  const nextDay = active?.days.find(d => d.date > today && d.exercises.length > 0);

  let body: React.ReactNode;
  if (week.planning || (week.needed && !week.error)) {
    body = (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
        <ThemedText type="smallBold" style={{ textAlign: 'center' }}>Your coach is planning your workout week</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Exercises to {focus.title.toLowerCase()}, on your training days. This takes about 30 seconds.</ThemedText>
      </View>
    );
  } else if (askDays) {
    body = (
      <>
        <ExerciseDaysCard goal={direction === 'gain' ? 'muscle_gain' : 'general_fitness'} onSaved={daysSaved} />
        <Button title="More settings (equipment, goal)" variant="secondary" onPress={() => router.push('/training-settings')} />
      </>
    );
  } else if (plans.isLoading) {
    body = <ActivityIndicator color={theme.tint} />;
  } else if (!active || weekEnded) {
    body = (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Couldn’t plan your workout week</ThemedText>
        {!!week.error && <ThemedText type="small" themeColor="textSecondary">{week.error.message}</ThemedText>}
        <Button title="Try again" icon="refresh" onPress={week.retry} />
      </View>
    );
  } else {
    body = (
      <>
        {/* The week, day by day */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.three }} contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.three }}>
          {active.days.map(d => {
            const selected = d.date === selectedDate;
            const rest = !d.exercises.length;
            const done = dayDone(d.date);
            const fg = selected ? theme.tintText : theme.text;
            return (
              <Pressable key={d.date} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${dateLabel(d.date)}, ${rest ? 'rest day' : done ? 'done' : d.title}`}
                onPress={() => setSelectedDate(d.date)} style={[styles.day, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
                <ThemedText type="small" style={{ fontSize: 12, color: selected ? theme.tintText : theme.textSecondary }}>{d.date === today ? 'Today' : weekday(d.date)}</ThemedText>
                <ThemedText style={{ fontSize: 18, fontWeight: 700, color: fg }}>{dayNumber(d.date)}</ThemedText>
                <Ionicons name={done ? 'checkmark-circle' : rest ? 'bed-outline' : d.date < today ? 'close-circle-outline' : 'barbell-outline'} size={14}
                  color={selected ? theme.tintText : done ? theme.tint : theme.textSecondary} />
              </Pressable>
            );
          })}
        </ScrollView>

        {isToday && onPeriod && (
          <View style={[styles.banner, { backgroundColor: `${theme.period}1F` }]}>
            <Ionicons name="flower" size={20} color={theme.period} />
            <View style={{ flex: 1, gap: 4 }}>
              <ThemedText type="smallBold">{periodMode === 'rest' ? 'Period day: rest today' : 'Period day: keep it light'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {periodMode === 'rest' ? 'Today won’t count as a missed workout. Change this in Profile → Period.' : 'A short walk and easy movements, or your planned workout if you feel well.'}
              </ThemedText>
              {periodMode === 'light' && !row && <Button title="Start gentle session" icon="walk-outline" onPress={startGentle} />}
            </View>
          </View>
        )}

        {isToday && !restToday && (row || day?.exercises.length) ? (
          <WorkoutTracker key={row?.session._id ?? `${active._id}:${today}`} row={row} day={day} planId={active._id} onChangeExercise={(i) => changeExercise(today, i)} />
        ) : day && day.exercises.length > 0 && !restToday ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={{ gap: 2 }}>
              <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>{day.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{dateLabel(day.date)} · {day.explanation}</ThemedText>
            </View>
            {day.exercises.map((p, i) => {
              const e = library.data?.find(x => x.id === p.exerciseId);
              return (
                <View key={`${p.exerciseId}:${i}`} style={[styles.exercise, { borderTopColor: theme.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText type="smallBold">{e?.name ?? p.exerciseId}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{p.sets} {p.sets === 1 ? 'set' : 'sets'} · {p.durationSeconds !== null ? `${Math.round(p.durationSeconds / 60) || 1} min` : `${p.repsMin}–${p.repsMax} reps`} · {p.restSeconds}s rest</ThemedText>
                  </View>
                  {day.date > today && (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Change ${e?.name ?? 'exercise'}`} onPress={() => changeExercise(day.date, i)} style={[styles.change, { borderColor: theme.border }]}>
                      <Ionicons name="swap-horizontal" size={16} color={theme.text} />
                      <ThemedText type="smallBold">Change</ThemedText>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <ThemedText type="small" themeColor="textSecondary">
              {day.date > today ? `You can start this workout on ${dateLabel(day.date)}.` : dayDone(day.date) ? 'Done. Nice work!' : 'This workout was missed.'}
            </ThemedText>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Rest day</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{restToday ? 'Take it easy today. Warmth, water and rest help.' : day?.explanation || 'Rest and recover.'}</ThemedText>
            {isToday && nextDay && (
              <View style={styles.inline}>
                <MaterialIcons name="event" size={18} color={theme.tint} />
                <ThemedText type="small">Next workout: <ThemedText type="smallBold">{dateLabel(nextDay.date)} · {nextDay.title}</ThemedText></ThemedText>
              </View>
            )}
          </View>
        )}

        {isToday && (
          <Button title="I did something else" icon="walk-outline" variant="secondary" onPress={() => setLogging(true)} />
        )}
      </>
    );
  }

  return (
    <View style={styles.page}>
      <Screen edges={[]}>
        <View style={[styles.focus, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.focusIcon, { backgroundColor: `${theme.tint}1F` }]}>
            <MaterialIcons name={focus.icon} size={22} color={theme.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">Your week: {focus.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{focus.text}</ThemedText>
          </View>
        </View>
        {body}
        {needsSignIn && <Button title="Sign in again to sync" onPress={() => router.push('/reauth')} />}
        {plans.isError && <Button title="Couldn’t refresh plans · Retry" variant="secondary" onPress={() => void plans.refetch()} />}
        {/* Room for the floating history button */}
        <View style={{ height: 72 }} />
      </Screen>
      {/* Hidden while choosing days, so it never covers the button */}
      {!askDays && <FloatingActions>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Workout history"
          onPress={() => router.push('/workout-history')}
          style={({ pressed }) => [styles.round, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="access-time" size={22} color={theme.tintText} />
        </Pressable>
      </FloatingActions>}
      <ExerciseChangeSheet target={changing} onClose={() => setChanging(null)} />
      <OtherActivitySheet visible={logging} onClose={() => setLogging(false)} date={today} planId={active?._id} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  card: { padding: Spacing.three, borderRadius: 20, gap: Spacing.three },
  focus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 18 },
  focusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  day: { width: 58, paddingVertical: Spacing.two, borderRadius: 16, alignItems: 'center', gap: 2 },
  banner: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderRadius: 18 },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  change: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: Spacing.two, borderRadius: 10, borderWidth: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
