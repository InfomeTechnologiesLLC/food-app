import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, calendarToday } from '../src/lib/calendar.js';
import { DEFAULT_TRAINING, availableExercises, validateWorkout, workoutOutputSchema, sessionPayloadSchema, trainingSchema, type WorkoutContext, type WorkoutOutput } from '../src/domain/exercise.js';
process.env.DATABASE_URL = 'mysql://localhost/mealmind-test';
process.env.JWT_SECRET = 'mealmind-test-secret';
process.env.GEMINI_API_KEY = 'mealmind-test-key';
const { generateWorkout, workoutPrompt, workoutResponseSchema } = await import('../src/ai/exercise.js');
const { gemini } = await import('../src/ai/gemini.js');
const input: WorkoutContext = { startDate: '2026-10-12', timezone: 'Asia/Kolkata', training: { ...DEFAULT_TRAINING, enabled: true }, body: { heightCm: 170, weightKg: 65 }, recentSessions: [{ feedback: 'hard', exercises: [{ exerciseId: 'wall-pushup', sets: [{ reps: 6, weightKg: null }] }] }] };
function valid(): WorkoutOutput {
  return { title: 'Your week', days: Array.from({ length: 7 }, (_, i) => ({ date: addDays(input.startDate, i), title: i % 2 === 0 && i < 5 ? 'Strength' : 'Rest', explanation: 'A manageable session or rest day', exercises: i % 2 === 0 && i < 5 ? [{ exerciseId: 'wall-pushup', sets: 2, repsMin: 6, repsMax: 10, durationSeconds: null, restSeconds: 60 }] : [] })) };
}
test('approved plans have seven dated days with matching schedule', () => { const plan = valid(); assert.ok(workoutOutputSchema.safeParse(plan).success); assert.deepEqual(validateWorkout(plan, input), []); });
test('reject unknown IDs, equipment mismatch, exclusions and incorrect dates', () => {
  for (const id of ['unknown', 'dumbbell-row']) { const plan = valid(); plan.days[0].exercises[0].exerciseId = id; assert.ok(validateWorkout(plan, input).some(e => e.includes('Unavailable'))); }
  const plan = valid(); assert.ok(validateWorkout(plan, { ...input, training: { ...input.training, excludedExercises: ['wall-pushup'] } }).length);
  plan.days[0].date = '2026-10-13'; assert.ok(validateWorkout(plan, input).some(e => e.includes('must be')));
  assert.ok(availableExercises(input.training).every(e => !e.equipment.length));
});
test('reject rest-day training, duplicate exercises, invalid tracking and excessive duration', () => {
  let plan = valid(); plan.days[1].exercises = structuredClone(plan.days[0].exercises); assert.ok(validateWorkout(plan, input).some(e => e.includes('weekdays')));
  plan = valid(); plan.days[0].exercises.push(structuredClone(plan.days[0].exercises[0])); assert.ok(validateWorkout(plan, input).some(e => e.includes('duplicate')));
  plan = valid(); plan.days[0].exercises[0].durationSeconds = 60; assert.ok(validateWorkout(plan, input).some(e => e.includes('rep range')));
  plan = valid(); plan.days[0].exercises = [{ exerciseId: 'walk', sets: 3, repsMin: null, repsMax: null, durationSeconds: 1200, restSeconds: 60 }]; assert.ok(validateWorkout(plan, input).some(e => e.includes('duration')));
  plan.days[0].exercises = [{ exerciseId: 'plank', sets: 1, repsMin: null, repsMax: null, durationSeconds: 120, restSeconds: 60 }]; assert.ok(validateWorkout(plan, input).some(e => e.includes('holds')));
  assert.equal(workoutOutputSchema.safeParse({ ...valid(), days: valid().days.slice(1) }).success, false);
  plan = valid(); plan.days[0].exercises[0].sets = 10; assert.equal(workoutOutputSchema.safeParse(plan).success, false);
});
test('AI gets body, equipment, goals, schedule, history and no prescribed weight instruction', async (t) => {
  let prompt = '';
  t.mock.method(gemini.models, 'generateContent', async (request: any) => { prompt = request.contents; return { text: JSON.stringify(valid()) }; });
  const result = await generateWorkout(input);
  assert.equal(result.title, 'Your week');
  for (const text of ['heightCm', 'weightKg', 'general_fitness', 'weekdays', 'hard', 'APPROVED EXERCISES', 'No prescribed weights']) assert.ok(prompt.includes(text));
  assert.ok(workoutPrompt(input).includes('not grounds') || workoutPrompt(input).includes('never grounds'));
});
test('provider decoding schema stays small while local bounds remain enforced', () => {
  const schema = JSON.stringify(workoutResponseSchema);
  for (const constraint of ['minimum', 'maximum', 'minItems', 'maxItems', 'pattern']) assert.equal(schema.includes(`"${constraint}"`), false);
  const plan = valid(); plan.days[0].exercises[0].sets = 99;
  assert.equal(workoutOutputSchema.safeParse(plan).success, false);
});
test('AI retries invalid output once with feedback; never returns invalid result', async () => {
  const prompts: string[] = [];
  const result = await generateWorkout(input, async prompt => { prompts.push(prompt); return prompts.length === 1 ? {} : valid(); });
  assert.equal(result.days.length, 7); assert.equal(prompts.length, 2); assert.match(prompts[1], /validation errors/);
  let count = 0;
  await assert.rejects(generateWorkout(input, async () => { count++; const p = valid(); p.days[0].exercises[0].exerciseId = 'invented'; return p; }), /could not produce a valid/);
  assert.equal(count, 2);
});
test('session validation distinguishes pending, skipped, completed and partial sets', () => {
  const base = { planId: null, scheduledDate: null, date: '2026-10-13', timezone: 'Asia/Kolkata', title: 'Walk', startedAt: '2026-10-13T03:00:00.000Z', finishedAt: null, status: 'in_progress', notes: '', feedback: null,
    exercises: [{ exerciseId: 'walk', restSeconds: 60, sets: [{ reps: null, weightKg: null, durationSeconds: null, distanceKm: null, status: 'pending' }] }] };
  assert.ok(sessionPayloadSchema.safeParse(base).success);
  assert.equal(sessionPayloadSchema.safeParse({ ...base, status: 'finished', finishedAt: '2026-10-13T03:10:00.000Z' }).success, true);
  const finished = { ...base, status: 'finished', finishedAt: '2026-10-13T03:10:00.000Z', exercises: [{ exerciseId: 'walk', restSeconds: 60, sets: [{ reps: null, weightKg: null, durationSeconds: 600, distanceKm: 1, status: 'completed' }, { reps: null, weightKg: null, durationSeconds: null, distanceKm: null, status: 'skipped' }] }] };
  assert.ok(sessionPayloadSchema.safeParse(finished).success);
  finished.exercises[0].sets[0].reps = 4 as any; assert.equal(sessionPayloadSchema.safeParse(finished).success, false);
  assert.equal(trainingSchema.safeParse({ ...DEFAULT_TRAINING, weekdays: [1, 1] }).success, false);
});
test('local date boundaries reflect the workout timezone', () => {
  assert.equal(calendarToday('Asia/Kolkata', new Date('2026-10-12T20:00:00Z')), '2026-10-13');
  assert.equal(calendarToday('America/Los_Angeles', new Date('2026-10-12T20:00:00Z')), '2026-10-12');
});

test('provider overload returns a recoverable error after bounded retries', async (t) => {
  const mock = t.mock.method(gemini.models, 'generateContent', async () => { throw Object.assign(new Error('overloaded'), { status: 503 }); });
  await assert.rejects(generateWorkout(input), (error: any) => error.status === 503 && /temporarily unavailable/.test(error.message));
  assert.equal(mock.mock.callCount(), 3);
});
