import type { ExerciseDefinition, LocalSession, SessionExercise, WorkoutDay, WorkoutSession, SetLog } from './exercise-types';

/** Used by both the unsaved daily preview and the first persisted session. */
export function prescribedExercises(day: WorkoutDay, library: ExerciseDefinition[]): SessionExercise[] {
  return day.exercises.map(p => {
    const definition = library.find(e => e.id === p.exerciseId);
    if (!definition) throw new Error('Exercise instructions are unavailable. Reconnect before starting.');
    return { exerciseId: p.exerciseId, definition, restSeconds: p.restSeconds,
      sets: Array.from({ length: p.sets }, () => ({ reps: p.repsMin, weightKg: null, durationSeconds: p.durationSeconds, distanceKm: null, status: 'pending' as const })),
    };
  });
}

export function isSetUnlocked(exercise: SessionExercise, setIndex: number): boolean {
  return setIndex >= 0 && setIndex < exercise.sets.length && exercise.sets.slice(0, setIndex).every(s => s.status !== 'pending');
}

export function patchWorkoutSet(session: WorkoutSession, exerciseIndex: number, setIndex: number, patch: Partial<SetLog>): WorkoutSession {
  const exercise = session.exercises[exerciseIndex];
  if (!exercise?.sets[setIndex]) return session;
  if (patch.status && patch.status !== 'pending' && exercise.sets[setIndex].status !== 'completed' && !isSetUnlocked(exercise, setIndex)) return session;
  const next = { ...exercise.sets[setIndex], ...patch };
  // Clearing an actual amount must not leave a completed set that cannot sync.
  if (next.status === 'completed' && !(exercise.definition.tracking === 'reps' ? next.reps : next.durationSeconds)) next.status = 'pending';
  return { ...session, exercises: session.exercises.map((e, i) => i !== exerciseIndex ? e : { ...e,
    sets: e.sets.map((s, j) => {
      if (j === setIndex) return next;
      // Later sets depend on this set being completed or skipped.
      if (j > setIndex && next.status === 'pending') return { ...s, status: 'pending' as const };
      return s;
    }),
  }) };
}

export function workoutProgress(session: WorkoutSession) {
  const sets = session.exercises.flatMap(e => e.sets);
  return { total: sets.length, completed: sets.filter(s => s.status === 'completed').length, skipped: sets.filter(s => s.status === 'skipped').length };
}

export function workoutDate(session: Pick<WorkoutSession, 'timezone'>, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: session.timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function archiveWorkoutDay(session: WorkoutSession, now = new Date()): WorkoutSession {
  // Recover sessions discarded by older app versions so today's work can resume.
  if ((session.status as string) === 'discarded') session = { ...session, status: 'in_progress', finishedAt: null };
  const ended = session.date < workoutDate(session, now);
  if (ended && session.status === 'in_progress') return { ...session, status: 'finished', finishedAt: now.toISOString() };
  if (!ended && session.status === 'finished') return { ...session, status: 'in_progress', finishedAt: null };
  return session;
}

/** Only today's session can take precedence when a plan was replaced. */
export function dailyWorkoutSession(rows: LocalSession[], date: string, planId?: string): LocalSession | undefined {
  const unfinished = rows.find(r => r.session.status === 'in_progress' && r.session.date === date);
  if (unfinished) return unfinished;
  const finished = rows.filter(r => r.session.status === 'finished' && r.session.date === date).sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
  return finished.find(r => r.session.planId === planId && r.session.scheduledDate === date) ?? finished[0];
}
