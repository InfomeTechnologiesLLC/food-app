import 'dotenv/config';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/mysql.js';
import { getDb } from '../src/db/client.js';
import { newId } from '../src/db/ids.js';
import * as schema from '../src/db/schema.js';
import { userRepo } from '../src/repos/users.js';
import { workoutPlanRepo } from '../src/repos/workouts.js';
import { plannedDayRepo } from '../src/repos/planned-days.js';
import exerciseRouter from '../src/routes/exercise.js';
import meRouter from '../src/routes/me.js';
import { DEFAULT_TRAINING } from '../src/domain/exercise.js';
import { calendarToday, addDays } from '../src/lib/calendar.js';

const userId = newId();
const today = calendarToday('UTC');
let database: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { database = await createTestDatabase('mealmind_planned_days_test'); });
beforeEach(async () => {
  await getDb().delete(schema.users);
  await userRepo.create({ id: userId, email: 'planned@example.test', passwordHash: 'test' });
  await userRepo.updateTraining(userId, { ...DEFAULT_TRAINING, enabled: true });
});
after(async () => { await database.drop(); });

async function invoke(router: typeof meRouter, path: string, method: string, request: Record<string, unknown> = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { data = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
  await route.stack[0].handle({ userId, query: {}, params: {}, body: {}, ...request } as any, response as any, () => {});
  return { status, data };
}

/** A week from `start`, training every other day. */
const week = (start: string) => Array.from({ length: 7 }, (_, i) => ({
  date: addDays(start, i), title: i % 2 ? 'Rest' : 'Strength', explanation: 'Test week',
  exercises: i % 2 ? [] : [{ exerciseId: 'wall-pushup', sets: 2, repsMin: 6, repsMax: 10, durationSeconds: null, restSeconds: 60 }],
}));
const context = { startDate: today, timezone: 'UTC', body: {}, training: { ...DEFAULT_TRAINING, enabled: true }, recentSessions: [] };
const rows = (from: string, to = today) => invoke(meRouter, '/planned-days', 'get', { query: { from, to } });

test('activating a new workout plan saves the finished training days of the old one', async () => {
  const old = await workoutPlanRepo.create({ userId, title: 'Old', status: 'active', days: week(addDays(today, -4)), context });
  const next = await workoutPlanRepo.create({ userId, title: 'New', days: week(today), context });
  const res = await invoke(exerciseRouter, '/plans/:id/activate', 'post', {
    params: { id: next._id }, body: { revision: next.__v, activeId: old._id, activeRevision: old.__v },
  });
  assert.equal(res.status, 200);
  const saved = await rows(addDays(today, -10));
  // Old plan trained on days -4 and -2 (day 0 is today, which belongs to the new plan)
  assert.deepEqual(saved.data, [
    { kind: 'workout', date: addDays(today, -4), planned: 1 },
    { kind: 'workout', date: addDays(today, -2), planned: 1 },
  ]);
});

test('deleting the active workout plan also saves its finished days; drafts save nothing', async () => {
  const active = await workoutPlanRepo.create({ userId, title: 'Active', status: 'active', days: week(addDays(today, -2)), context });
  const draft = await workoutPlanRepo.create({ userId, title: 'Draft', days: week(addDays(today, -6)), context });
  await invoke(exerciseRouter, '/plans/:id', 'delete', { params: { id: draft._id } });
  assert.deepEqual((await rows(addDays(today, -10))).data, []);
  await invoke(exerciseRouter, '/plans/:id', 'delete', { params: { id: active._id } });
  assert.deepEqual((await rows(addDays(today, -10))).data, [{ kind: 'workout', date: addDays(today, -2), planned: 1 }]);
});

test('meal days are saved, a later save for the same day wins, and the range is validated', async () => {
  const day = (offset: number, meals: number) => ({ date: addDays(today, offset), planned: meals });
  await getDb().transaction(tx => plannedDayRepo.recordPast(tx, userId, 'meal', [day(-3, 3), day(-1, 2), day(0, 3)], today));
  await getDb().transaction(tx => plannedDayRepo.recordPast(tx, userId, 'meal', [day(-1, 4)], today));
  assert.deepEqual((await rows(addDays(today, -7))).data, [
    { kind: 'meal', date: addDays(today, -3), planned: 3 },
    { kind: 'meal', date: addDays(today, -1), planned: 4 },
  ]);
  assert.equal((await rows(today, addDays(today, -1))).status, 400);
  assert.equal((await rows(addDays(today, -500))).status, 400);
  assert.equal((await invoke(meRouter, '/planned-days', 'get', { query: { from: 'yesterday', to: today } })).status, 400);
});