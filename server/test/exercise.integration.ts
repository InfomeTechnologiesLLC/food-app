import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { User } from '../src/models/User.js';
import { WorkoutPlan, WorkoutSession } from '../src/models/Workout.js';
import router from '../src/routes/exercise.js';
import { gemini } from '../src/ai/gemini.js';
import { DEFAULT_TRAINING } from '../src/domain/exercise.js';
import { calendarToday, addDays } from '../src/lib/calendar.js';
const userId = String(new Types.ObjectId()); const otherId = String(new Types.ObjectId());
const dbName = `mealmind_exercise_test_${Date.now()}`;
before(async () => { await mongoose.connect(process.env.MONGODB_URI!, { dbName, serverSelectionTimeoutMS: 10000 }); await Promise.all([User.init(), WorkoutPlan.init(), WorkoutSession.init()]); });
beforeEach(async () => {
  await Promise.all([WorkoutPlan.deleteMany({}), WorkoutSession.deleteMany({}), User.deleteMany({})]);
  await User.create([{ _id: userId, email: 'exercise@example.test', passwordHash: 'test', training: { ...DEFAULT_TRAINING, enabled: true } }, { _id: otherId, email: 'other@example.test', passwordHash: 'test' }]);
});
after(async () => { if (mongoose.connection.db) await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); });
async function invoke(path: string, method: string, request: Record<string, unknown> = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { data = value?.toObject ? value.toObject() : value; return this; }, end() { return this; } };
  await route.stack[0].handle({ userId, ...request } as any, response as any, () => {});
  return { status, data };
}
function generated(startDate = calendarToday('UTC')) {
  return { title: 'AI week', days: Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startDate, i); const train = DEFAULT_TRAINING.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    return { date, title: train ? 'Strength' : 'Rest', explanation: 'Manageable training week', exercises: train ? [{ exerciseId: 'wall-pushup', sets: 2, repsMin: 6, repsMax: 10, durationSeconds: null, restSeconds: 60 }] : [] };
  }) };
}
async function makePlan() { return WorkoutPlan.create({ userId, ...generated(), context: { startDate: calendarToday('UTC'), timezone: 'UTC', body: {}, training: { ...DEFAULT_TRAINING, enabled: true }, recentSessions: [] } }); }
function payload() { const now = new Date().toISOString(); return { planId: null, scheduledDate: null, date: calendarToday('UTC'), timezone: 'UTC', title: 'Walk', startedAt: now, finishedAt: null, status: 'in_progress', notes: '', feedback: null,
  exercises: [{ exerciseId: 'walk', restSeconds: 60, sets: [{ reps: null, weightKg: null, durationSeconds: 600, distanceKm: null, status: 'pending' }] }] }; }
test('AI generation stores a draft with body/profile context; invalid outputs save nothing', async t => {
  await User.updateOne({ _id: userId }, { $set: { body: { heightCm: 170, weightKg: 65 } } });
  t.mock.method(gemini.models, 'generateContent', async () => ({ text: JSON.stringify(generated()) }));
  const result = await invoke('/plans', 'post', { body: { startDate: calendarToday('UTC'), timezone: 'UTC' } });
  assert.equal(result.status, 201); assert.equal(result.data.status, 'draft'); assert.equal(result.data.context.body.weightKg, 65);
  assert.equal(await WorkoutPlan.countDocuments({ status: 'active' }), 0);
  t.mock.method(gemini.models, 'generateContent', async () => ({ text: '{}' }));
  const bad = await invoke('/plans', 'post', { body: { startDate: calendarToday('UTC'), timezone: 'UTC' } });
  assert.equal(bad.status, 502); assert.equal(await WorkoutPlan.countDocuments(), 1);
});
test('disabled profiles cannot generate exercise plans', async () => {
  const result = await invoke('/plans', 'post', { userId: otherId, body: { startDate: calendarToday('UTC'), timezone: 'UTC' } }); assert.equal(result.status, 400);
});
test('activation checks target revisions and deletes replaced plan without deleting sessions', async () => {
  const first = await makePlan(); const second = await makePlan();
  assert.equal((await invoke('/plans/:id/activate', 'post', { params: { id: String(first._id) }, body: { revision: 0, activeId: null, activeRevision: null } })).status, 200);
  assert.equal((await invoke('/plans/:id/activate', 'post', { params: { id: String(second._id) }, body: { revision: 0, activeId: null, activeRevision: null } })).status, 409);
  const active = await WorkoutPlan.findById(first._id);
  const id = randomUUID();
  await invoke('/sessions/:id', 'put', { params: { id }, body: { baseRevision: 0, operationId: randomUUID(), session: { ...payload(), planId: String(first._id) } } });
  const storedBefore = await WorkoutSession.findById(id).lean();
  const result = await invoke('/plans/:id/activate', 'post', { params: { id: String(second._id) }, body: { revision: 0, activeId: String(first._id), activeRevision: active!.__v } });
  assert.equal(result.status, 200); assert.equal(await WorkoutPlan.countDocuments({ status: 'active' }), 1); assert.equal(await WorkoutPlan.findById(first._id), null);
  assert.equal(result.data.status, 'active');
  assert.deepEqual(await WorkoutSession.findById(id).lean(), storedBefore);
});
test('editing supports approved substitutions and rejects equipment mismatch or stale revisions', async () => {
  const plan = await makePlan(); const value = generated(); const day = value.days.find(d => d.exercises.length)!; day.exercises[0].exerciseId = 'knee-pushup';
  const result = await invoke('/plans/:id', 'patch', { params: { id: String(plan._id) }, body: { ...value, revision: 0 } }); assert.equal(result.status, 200);
  assert.equal((await invoke('/plans/:id', 'patch', { params: { id: String(plan._id) }, body: { ...value, revision: 0 } })).status, 409);
  day.exercises[0].exerciseId = 'dumbbell-row'; assert.equal((await invoke('/plans/:id', 'patch', { params: { id: String(plan._id) }, body: { ...value, revision: 1 } })).status, 400);
});
test('retry is idempotent and concurrent updates allow one revision winner', async () => {
  const id = randomUUID(); const operationId = randomUUID(); const session = payload();
  const request = { params: { id }, body: { baseRevision: 0, operationId, session } };
  assert.equal((await invoke('/sessions/:id', 'put', request)).status, 201);
  const replay = await invoke('/sessions/:id', 'put', request); assert.equal(replay.status, 200); assert.equal(replay.data.revision, 1); assert.equal(await WorkoutSession.countDocuments(), 1);
  const results = await Promise.all(['first', 'second'].map(notes => invoke('/sessions/:id', 'put', { params: { id }, body: { baseRevision: 1, operationId: randomUUID(), session: { ...session, notes } } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await WorkoutSession.findById(id))!.revision, 2);
  assert.ok(results.find(r => r.status === 409)!.data.server);
});
test('sessions retain library snapshots and survive source plan deletion', async () => {
  const plan = await makePlan(); const id = randomUUID(); const session = { ...payload(), planId: String(plan._id), scheduledDate: calendarToday('UTC') };
  session.exercises[0].sets[0].status = 'completed'; session.status = 'finished'; session.finishedAt = session.startedAt as any;
  await invoke('/sessions/:id', 'put', { params: { id }, body: { baseRevision: 0, operationId: randomUUID(), session } });
  await invoke('/plans/:id', 'delete', { params: { id: String(plan._id) } });
  const stored = await WorkoutSession.findById(id); assert.equal(stored!.status, 'finished'); assert.equal(stored!.exercises[0].definition.name, 'Walking');
  assert.equal((await invoke('/sessions', 'get', { query: {} })).data.entries.length, 1);
});
test('sessions and plans cannot expose or overwrite another account’s data', async () => {
  const plan = await makePlan(); const id = randomUUID(); const session = payload();
  await invoke('/sessions/:id', 'put', { params: { id }, body: { baseRevision: 0, operationId: randomUUID(), session } });
  const attack = await invoke('/sessions/:id', 'put', { userId: otherId, params: { id }, body: { baseRevision: 0, operationId: randomUUID(), session } });
  assert.equal(attack.status, 409); assert.equal(attack.data.server, null);
  assert.equal((await invoke('/plans/:id', 'patch', { userId: otherId, params: { id: String(plan._id) }, body: { ...generated(), revision: 0 } })).status, 404);
  assert.equal((await invoke('/sessions', 'get', { userId: otherId, query: {} })).data.entries.length, 0);
});
test('session history is paginated and discards are excluded', async () => {
  for (let i = 0; i < 3; i++) await invoke('/sessions/:id', 'put', { params: { id: randomUUID() }, body: { baseRevision: 0, operationId: randomUUID(), session: payload() } });
  const first = await invoke('/sessions', 'get', { query: { limit: 2 } }); assert.equal(first.data.entries.length, 2); assert.ok(first.data.nextCursor);
  const last = await invoke('/sessions', 'get', { query: { limit: 2, cursor: first.data.nextCursor } }); assert.equal(last.data.entries.length, 1); assert.equal(last.data.nextCursor, null);
  const id = randomUUID(); const session = payload(); await invoke('/sessions/:id', 'put', { params: { id }, body: { baseRevision: 0, operationId: randomUUID(), session: { ...session, status: 'discarded', finishedAt: session.startedAt } } });
  assert.equal((await invoke('/sessions', 'get', { query: {} })).data.entries.length, 3);
});
