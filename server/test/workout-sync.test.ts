import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeSession, reconcileSessions, sessionPayload, weeklyWorkoutTotals } from '../../mobile/src/lib/workout-sync.ts';
import type { LocalSession, WorkoutSession } from '../../mobile/src/lib/exercise-types.ts';
function session(): WorkoutSession { return { _id: 'id', revision: 0, planId: null, scheduledDate: null, date: '2026-10-13', timezone: 'UTC', title: 'Walk', startedAt: '2026-10-13T10:00:00.000Z', finishedAt: null, status: 'in_progress', notes: '', feedback: null, exercises: [{ exerciseId: 'walk', restSeconds: 60, definition: { id: 'walk', name: 'Walking', category: 'cardio', equipment: [], tracking: 'duration', instructions: ['Walk'] }, sets: [{ status: 'pending', durationSeconds: 600, reps: null, weightKg: null, distanceKm: null }] }] }; }
test('complete server history removes deleted cached walks and preserves unsynced workouts', () => {
  const cached: LocalSession = { session: session(), pending: false, operationId: 'saved', error: null, conflict: null };
  const pending = { ...cached, pending: true, session: { ...session(), _id: 'offline-workout' } };
  const conflict = { ...cached, conflict: session(), session: { ...session(), _id: 'conflicting-workout' } };
  const strength = { ...session(), _id: 'strength-workout', title: 'Full body strength' };
  const rows = reconcileSessions([cached, pending, conflict], [strength], () => 'new-operation');
  assert.deepEqual(rows.map(row => row.session._id), ['offline-workout', 'conflicting-workout', 'strength-workout']);
  assert.equal(rows[0], pending);
  assert.equal(rows[1], conflict);
  assert.equal(rows[2].pending, false);
  const updated = { ...strength, revision: 2 };
  assert.equal(reconcileSessions([rows[2]], [updated], () => 'unused')[0].session.revision, 2);
});
test('acknowledgement clears only the version actually sent', () => {
  const local: LocalSession = { session: session(), pending: true, operationId: 'operation-1', error: null, conflict: null, delivery: { operationId: 'operation-1', session: session() } };
  const server = { ...session(), revision: 1 };
  assert.equal(acknowledgeSession(local, 'operation-1', server).pending, false);
  const edited = { ...local, operationId: 'operation-2', session: { ...session(), notes: 'Edited during sync' } };
  const next = acknowledgeSession(edited, 'operation-1', server);
  assert.equal(next.pending, true); assert.equal(next.session.notes, 'Edited during sync'); assert.equal(next.session.revision, 1); assert.equal(next.delivery, undefined);
});
test('pending delivery survives serialized app restart without losing its operation identity', () => {
  const row: LocalSession = { session: session(), operationId: 'later-edit', pending: true, error: 'offline', conflict: null, delivery: { operationId: 'sent-before-disconnect', session: session() } };
  row.session.notes = 'new local change'; const reopened = JSON.parse(JSON.stringify(row)) as LocalSession;
  assert.equal(reopened.delivery!.operationId, 'sent-before-disconnect');
  assert.equal(reopened.delivery!.session.notes, ''); assert.equal(reopened.session.notes, 'new local change');
  const ack = acknowledgeSession(reopened, reopened.delivery!.operationId, { ...session(), revision: 1 }); assert.equal(ack.pending, true); assert.equal(ack.session.notes, 'new local change');
});
test('wire payload excludes server-owned exercise snapshots and session metadata', () => {
  const payload = sessionPayload(session()); assert.equal('_id' in payload, false); assert.equal('revision' in payload, false); assert.equal('definition' in payload.exercises[0], false);
});
test('weekly totals count finished partial sessions and exclude in-progress sessions', () => {
  const finished: WorkoutSession = { ...session(), status: 'finished', finishedAt: '2026-10-13T10:10:00.000Z', exercises: [{ ...session().exercises[0], sets: [{ ...session().exercises[0].sets[0], status: 'completed' }, { ...session().exercises[0].sets[0], status: 'skipped' }] }] };
  assert.deepEqual(weeklyWorkoutTotals([finished, session(), { ...finished, date: '2026-10-01' }], '2026-10-12', '2026-10-18'), { workouts: 1, completedSets: 1, minutes: 10 });
});
test('weekly minutes use logged durations even when a walk is left open overnight', () => {
  const walk = (seconds: number, finishedAt: string): WorkoutSession => ({ ...session(), status: 'finished', finishedAt,
    exercises: [{ ...session().exercises[0], sets: [{ ...session().exercises[0].sets[0], status: 'completed', durationSeconds: seconds }] }] });
  assert.deepEqual(weeklyWorkoutTotals([walk(2700, '2026-10-13T10:02:00.000Z'), walk(600, '2026-10-14T00:46:00.000Z')], '2026-10-12', '2026-10-14'),
    { workouts: 2, completedSets: 2, minutes: 55 });
});
test('weekly minutes exclude pending, skipped, invalid and rep-tracked durations', () => {
  const exercise = session().exercises[0];
  const set = exercise.sets[0];
  const finished: WorkoutSession = { ...session(), status: 'finished', finishedAt: null, exercises: [
    { ...exercise, sets: [
      { ...set, status: 'completed', durationSeconds: 90 },
      { ...set, status: 'pending', durationSeconds: 600 },
      { ...set, status: 'skipped', durationSeconds: 600 },
      ...[null, -60, NaN, Infinity].map(durationSeconds => ({ ...set, status: 'completed' as const, durationSeconds })),
    ] },
    { ...exercise, definition: { ...exercise.definition, tracking: 'reps' }, sets: [{ ...set, status: 'completed', reps: 10 }] },
  ] };
  assert.equal(weeklyWorkoutTotals([finished], '2026-10-12', '2026-10-14').minutes, 1.5);
});
