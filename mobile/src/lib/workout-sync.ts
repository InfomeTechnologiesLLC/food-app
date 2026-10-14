import type { LocalSession, WorkoutSession } from './exercise-types';
export function reconcileSessions(local: LocalSession[], server: WorkoutSession[], operationId: () => string): LocalSession[] {
  const saved = new Map(server.map(session => [session._id, session]));
  const rows = local.flatMap(row => {
    const session = saved.get(row.session._id);
    saved.delete(row.session._id);
    if (row.pending || row.conflict) return [row];
    return session ? [{ ...row, session }] : [];
  });
  return [...rows, ...Array.from(saved.values(), session => ({ session, pending: false, operationId: operationId(), error: null, conflict: null }))];
}
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
