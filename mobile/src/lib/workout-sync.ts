import type { LocalSession, WorkoutSession } from './exercise-types';
export function acknowledgeSession(local: LocalSession, sentOperationId: string, server: WorkoutSession): LocalSession {
  if (local.operationId === sentOperationId) return { ...local, session: server, pending: false, error: null, conflict: null, delivery: undefined };
  return { ...local, session: { ...local.session, revision: server.revision }, pending: true, error: null, conflict: null, delivery: undefined };
}
export function sessionPayload(session: WorkoutSession) {
  const { _id, revision, exercises, ...payload } = session;
  // Server-owned snapshots, timestamps and account fields never come from the client.
  return { planId: payload.planId, scheduledDate: payload.scheduledDate, date: payload.date, timezone: payload.timezone, title: payload.title,
    startedAt: payload.startedAt, finishedAt: payload.finishedAt, status: payload.status, notes: payload.notes, feedback: payload.feedback,
    exercises: exercises.map(({ exerciseId, sets, restSeconds }) => ({ exerciseId, sets, restSeconds })) };
}
export function weeklyWorkoutTotals(sessions: WorkoutSession[], start: string, end: string) {
  const finished = sessions.filter(s => s.status === 'finished' && s.date >= start && s.date <= end);
  return { workouts: finished.length, completedSets: finished.reduce((n, s) => n + s.exercises.reduce((n, e) => n + e.sets.filter(x => x.status === 'completed').length, 0), 0),
    // Session timestamps include time spent away from the app. Only completed,
    // duration-tracked sets provide an actual logged exercise duration.
    minutes: finished.reduce((n, s) => n + s.exercises.reduce((n, e) => n + (e.definition.tracking === 'duration'
      ? e.sets.reduce((n, set) => n + (set.status === 'completed' && Number.isFinite(set.durationSeconds) && (set.durationSeconds ?? 0) > 0 ? set.durationSeconds! / 60 : 0), 0)
      : 0), 0), 0) };
}
