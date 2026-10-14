import { archiveWorkoutDay as archiveServerDay } from '../src/lib/workout-day.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSetUnlocked, dailyWorkoutSession, patchWorkoutSet, prescribedExercises, workoutProgress, archiveWorkoutDay } from '../../mobile/src/lib/workout-tracking.ts';
import type { ExerciseDefinition, LocalSession, WorkoutDay, WorkoutSession } from '../../mobile/src/lib/exercise-types.ts';

const library: ExerciseDefinition[] = [
  { id: 'squat', name: 'Squat', category: 'squat', equipment: [], tracking: 'reps', instructions: ['Squat'] },
  { id: 'plank', name: 'Plank', category: 'core', equipment: [], tracking: 'duration', instructions: ['Hold'] },
];
const day: WorkoutDay = { date: '2026-10-14', title: 'Today', explanation: '', exercises: [
  { exerciseId: 'squat', sets: 3, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60 },
  { exerciseId: 'plank', sets: 1, repsMin: null, repsMax: null, durationSeconds: 30, restSeconds: 30 },
] };
function session(): WorkoutSession {
  return { _id: 'session', revision: 0, planId: 'plan', scheduledDate: day.date, date: day.date, timezone: 'UTC', title: day.title,
    startedAt: '2026-10-14T10:00:00.000Z', finishedAt: null, status: 'in_progress', notes: '', feedback: null, exercises: prescribedExercises(day, library) };
}
function row(s: WorkoutSession): LocalSession { return { session: s, pending: true, operationId: s._id, error: null, conflict: null }; }

test('daily preview and persisted session share reps and duration targets, with independent sets', () => {
  const exercises = prescribedExercises(day, library);
  assert.equal(exercises[0].sets[0].reps, 8);
  assert.equal(exercises[1].sets[0].durationSeconds, 30);
  exercises[0].sets[0].status = 'completed';
  assert.equal(exercises[0].sets[1].status, 'pending');
  assert.equal(prescribedExercises(day, library)[0].sets[0].status, 'pending');
  assert.throws(() => prescribedExercises(day, library.slice(0, 1)), /Reconnect/);
});
test('completion and undo preserve actual values without mutating the saved snapshot', () => {
  const initial = session();
  const edited = patchWorkoutSet(initial, 0, 0, { reps: 10, weightKg: 12 });
  const completed = patchWorkoutSet(edited, 0, 0, { status: 'completed' });
  assert.equal(completed.exercises[0].sets[0].reps, 10);
  assert.equal(completed.exercises[0].sets[0].weightKg, 12);
  assert.equal(initial.exercises[0].sets[0].status, 'pending');
  assert.equal(initial.exercises[0].sets[0].reps, 8);
  const undone = patchWorkoutSet(completed, 0, 0, { status: 'pending' });
  assert.equal(undone.exercises[0].sets[0].reps, 10);
  assert.equal(workoutProgress(undone).completed, 0);
});
test('progress excludes skipped and pending sets, including after serialized restart', () => {
  let s = patchWorkoutSet(session(), 0, 0, { status: 'completed' });
  s = patchWorkoutSet(s, 0, 1, { status: 'skipped' });
  assert.deepEqual(workoutProgress(JSON.parse(JSON.stringify(s))), { total: 4, completed: 1, skipped: 1 });
});
test('today’s unfinished workout takes precedence across plan replacement', () => {
  const old = row({ ...session(), _id: 'old', date: '2026-10-13', planId: 'replaced-plan' });
  const finished = row({ ...session(), status: 'finished' });
  assert.equal(dailyWorkoutSession([finished, old], day.date, 'plan')?.session._id, 'session');
  assert.equal(dailyWorkoutSession([finished, old], '2026-10-15', 'new-plan'), undefined);
  assert.equal(dailyWorkoutSession([row(session())], day.date, 'new-plan')?.session._id, 'session');
});
test('prefer today’s scheduled completed workout and ignore previous-day sessions', () => {
  const scheduled = row({ ...session(), status: 'finished' });
  const walk = row({ ...session(), _id: 'walk', planId: null, scheduledDate: null, status: 'finished', startedAt: '2026-10-14T12:00:00.000Z' });
  assert.equal(dailyWorkoutSession([walk, scheduled], day.date, 'plan')?.session._id, 'session');
  assert.equal(dailyWorkoutSession([walk, scheduled], day.date, 'other')?.session._id, 'walk');
  assert.equal(dailyWorkoutSession([walk, scheduled], '2026-10-15', 'plan'), undefined);
});

test('clearing actual reps or duration makes a completed set pending so it can still sync', () => {
  const completed = patchWorkoutSet(session(), 0, 0, { status: 'completed' });
  assert.equal(patchWorkoutSet(completed, 0, 0, { reps: null }).exercises[0].sets[0].status, 'pending');
  const timed = patchWorkoutSet(session(), 1, 0, { status: 'completed' });
  assert.equal(patchWorkoutSet(timed, 1, 0, { durationSeconds: null }).exercises[1].sets[0].status, 'pending');
});

test('sets unlock in order after completion or skipping, and locked sets cannot be marked', () => {
  const initial = session();
  assert.equal(isSetUnlocked(initial.exercises[0], 0), true);
  assert.equal(isSetUnlocked(initial.exercises[0], 1), false);
  assert.equal(patchWorkoutSet(initial, 0, 1, { status: 'completed' }), initial);
  assert.equal(patchWorkoutSet(initial, 0, 2, { status: 'skipped' }), initial);
  const first = patchWorkoutSet(initial, 0, 0, { status: 'completed' });
  assert.equal(isSetUnlocked(first.exercises[0], 1), true);
  const second = patchWorkoutSet(first, 0, 1, { status: 'skipped' });
  assert.equal(isSetUnlocked(second.exercises[0], 2), true);
  const undone = patchWorkoutSet(second, 0, 0, { status: 'pending' });
  assert.equal(isSetUnlocked(undone.exercises[0], 2), false);
  assert.equal(isSetUnlocked(JSON.parse(JSON.stringify(second)).exercises[0], 2), true);
});
test('undoing an earlier set resets later sets and preserves their entered values', () => {
  let s = patchWorkoutSet(session(), 0, 0, { status: 'completed' });
  s = patchWorkoutSet(s, 0, 1, { status: 'completed', reps: 10, weightKg: 12 });
  s = patchWorkoutSet(s, 0, 2, { status: 'completed' });
  const undone = patchWorkoutSet(s, 0, 0, { status: 'pending' });
  assert.deepEqual(undone.exercises[0].sets.map(set => set.status), ['pending', 'pending', 'pending']);
  assert.equal(undone.exercises[0].sets[1].reps, 10);
  assert.equal(undone.exercises[0].sets[1].weightKg, 12);
  assert.equal(workoutProgress(undone).completed, 0);
  assert.equal(isSetUnlocked(undone.exercises[0], 1), false);
  assert.equal(isSetUnlocked(undone.exercises[0], 2), false);
  assert.equal(s.exercises[0].sets[2].status, 'completed');
  const middle = patchWorkoutSet(s, 0, 1, { status: 'pending' });
  assert.deepEqual(middle.exercises[0].sets.map(set => set.status), ['completed', 'pending', 'pending']);
  const cleared = patchWorkoutSet(s, 0, 0, { reps: null });
  assert.deepEqual(cleared.exercises[0].sets.map(set => set.status), ['pending', 'pending', 'pending']);
});
test('unskipping an earlier set resets later completed and skipped sets', () => {
  let s = patchWorkoutSet(session(), 0, 0, { status: 'skipped' });
  s = patchWorkoutSet(s, 0, 1, { status: 'skipped' });
  s = patchWorkoutSet(s, 0, 2, { status: 'completed' });
  s = patchWorkoutSet(s, 0, 0, { status: 'pending' });
  assert.deepEqual(s.exercises[0].sets.map(set => set.status), ['pending', 'pending', 'pending']);
});

test('day rollover archives partial workouts in the original timezone and reopens today’s legacy finish', () => {
  const s = { ...session(), timezone: 'Asia/Kolkata' };
  assert.equal(archiveWorkoutDay(s, new Date('2026-10-14T18:29:59Z')), s);
  const archived = archiveWorkoutDay(s, new Date('2026-10-14T18:30:00Z'));
  assert.equal(archived.status, 'finished');
  assert.equal(workoutProgress(archived).completed, 0);
  assert.equal(archiveWorkoutDay(archived, new Date('2026-10-16T00:00:00Z')), archived);
  assert.equal(archiveWorkoutDay({ ...s, status: 'finished', finishedAt: s.startedAt }, new Date('2026-10-14T12:00:00Z')).status, 'in_progress');
  const legacyDiscarded = { ...s, status: 'discarded', finishedAt: s.startedAt };
  assert.equal(archiveWorkoutDay(legacyDiscarded, new Date('2026-10-14T12:00:00Z')).status, 'in_progress');
});

test('server day rollover agrees with offline client behavior', () => {
  const today = { ...session(), timezone: 'America/New_York' };
  for (const instant of ['2026-10-15T03:59:59Z', '2026-10-15T04:00:00Z']) {
    const now = new Date(instant);
    assert.deepEqual(archiveServerDay(today, now), archiveWorkoutDay(today, now));
  }
});
