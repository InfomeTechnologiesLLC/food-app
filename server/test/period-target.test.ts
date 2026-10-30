import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTargetWeight } from '../src/lib/targets.js';
import { cycleStats, periodDaysBetween, periodStatus, type PeriodLog } from '../src/lib/period.js';
import { replaceExercise } from '../src/ai/exercise.js';
import { DEFAULT_TRAINING, type WorkoutContext, type WorkoutOutput } from '../src/domain/exercise.js';
import { addDays } from '../src/lib/calendar.js';

test('suggested target weight follows the goal and stays in a healthy range', () => {
  // 175 cm: BMI 22 = 67.4 kg, BMI 25 = 76.6 kg
  assert.equal(suggestTargetWeight(175, 90, 'weight_loss'), 81); // 10% loss
  assert.equal(suggestTargetWeight(175, 70, 'weight_loss'), 67.5); // stops at BMI 22
  assert.equal(suggestTargetWeight(175, 66, 'weight_loss'), 61.5); // BMI 21.6: down to BMI 20
  assert.equal(suggestTargetWeight(175, 60, 'weight_loss'), 60); // BMI 19.6: no loss planned
  assert.equal(suggestTargetWeight(175, 66, 'muscle_gain'), 69.5); // +5%
  assert.equal(suggestTargetWeight(175, 75, 'muscle_gain'), 76.5); // capped at BMI 25
  assert.equal(suggestTargetWeight(175, 80, 'muscle_gain'), 80); // already above BMI 25: keep
  assert.equal(suggestTargetWeight(175, 52, 'muscle_gain'), 61.5); // underweight: aim for BMI 20
  assert.equal(suggestTargetWeight(160, 58.2, 'balanced'), 58);
});

const log = (startDate: string, endDate: string | null = null, _id = startDate): PeriodLog => ({ _id, startDate, endDate });
const settings = { cycleLength: 28, periodLength: 5 };

test('cycle and period length come from the logs, or the settings until there are enough', () => {
  assert.deepEqual(cycleStats([], settings), { averageCycle: 28, averagePeriod: 5 });
  assert.deepEqual(cycleStats([log('2026-08-01', '2026-08-04'), log('2026-08-31', '2026-09-03'), log('2026-09-30')], settings), { averageCycle: 30, averagePeriod: 4 });
  // A 60-day gap (a missed log) is ignored
  assert.equal(cycleStats([log('2026-06-01'), log('2026-07-31'), log('2026-08-29')], settings).averageCycle, 29);
});

test('period status: on a period, the day number and the next expected date', () => {
  const logs = [log('2026-09-01', '2026-09-05'), log('2026-09-30')];
  const during = periodStatus(logs, settings, '2026-10-02');
  assert.equal(during.onPeriod, true);
  assert.equal(during.dayOfPeriod, 3);
  assert.equal(during.nextStart, '2026-10-29'); // 29-day cycle
  const after = periodStatus(logs, settings, '2026-10-10');
  assert.equal(after.onPeriod, false); // open period ends after the usual 5 days
  assert.equal(after.daysUntilNext, 19);
  const late = periodStatus(logs, settings, '2026-11-01');
  assert.equal(late.daysUntilNext, -3);
  assert.equal(periodStatus([], settings, '2026-10-10').nextStart, null);
});

test('period days in a range include logged and expected days', () => {
  const logs = [log('2026-10-01', '2026-10-04')];
  assert.deepEqual(periodDaysBetween(logs, settings, '2026-10-03', '2026-10-06'), ['2026-10-03', '2026-10-04']);
  assert.deepEqual(periodDaysBetween(logs, settings, '2026-10-27', '2026-11-02'), ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(periodDaysBetween([], settings, '2026-10-01', '2026-10-07'), []);
});

const start = '2026-11-02'; // a Monday
const context: WorkoutContext = { startDate: start, timezone: 'UTC', training: { ...DEFAULT_TRAINING, enabled: true }, body: {}, recentSessions: [] };
const week: WorkoutOutput = { title: 'Week', days: Array.from({ length: 7 }, (_, i) => {
  const date = addDays(start, i); const train = [1, 3, 5].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  return { date, title: train ? 'Full body' : 'Rest', explanation: train ? 'Strength' : 'Rest', exercises: train ? [
    { exerciseId: 'knee-pushup', sets: 2, repsMin: 6, repsMax: 10, durationSeconds: null, restSeconds: 60 },
    { exerciseId: 'bodyweight-squat', sets: 2, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60 }] : [] };
}) };

test('an exercise swap uses an approved exercise, keeps the rest of the day and retries invalid answers', async () => {
  const prompts: string[] = [];
  const answers = [
    { exerciseId: 'bench-press', sets: 2, repsMin: 8, repsMax: 10, durationSeconds: null, restSeconds: 60, reason: 'Needs a bench' }, // not available
    { exerciseId: 'walk', sets: 1, repsMin: null, repsMax: null, durationSeconds: 600, restSeconds: 30, reason: 'You said you prefer walking.' },
  ];
  const result = await replaceExercise({ plan: week, context, date: start, index: 0, request: 'no push-ups, I prefer walking' }, async (p) => { prompts.push(p); return answers.shift(); });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1]!, /bench-press is not one of the approved choices/);
  assert.ok(!prompts[0]!.includes('"id":"knee-pushup"'), 'the current exercise is not offered again');
  const day = result.plan.days[0]!;
  assert.deepEqual(day.exercises.map((e) => e.exerciseId), ['walk', 'bodyweight-squat']);
  assert.equal(result.reason, 'You said you prefer walking.');
  // Other days are untouched
  assert.deepEqual(result.plan.days[2], week.days[2]);
});

test('an exercise swap that breaks the session length is rejected after a retry', async () => {
  const tooLong = { exerciseId: 'walk', sets: 3, repsMin: null, repsMax: null, durationSeconds: 900, restSeconds: 60, reason: 'Long walk' };
  await assert.rejects(replaceExercise({ plan: week, context, date: start, index: 0, request: 'walking' }, async () => tooLong), /could not find a suitable swap/);
});
