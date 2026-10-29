import 'dotenv/config';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/mysql.js';
import { getDb } from '../src/db/client.js';
import { newId } from '../src/db/ids.js';
import * as schema from '../src/db/schema.js';
import { userRepo } from '../src/repos/users.js';
import meRouter from '../src/routes/me.js';
import { calendarToday, addDays } from '../src/lib/calendar.js';

const userId = newId();
const otherId = newId();
const today = calendarToday('UTC');
let database: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { database = await createTestDatabase('mealmind_water_test'); });
beforeEach(async () => {
  await getDb().delete(schema.users);
  await userRepo.create({ id: userId, email: 'water@example.test', passwordHash: 'test' });
  await userRepo.create({ id: otherId, email: 'other@example.test', passwordHash: 'test' });
});
after(async () => { await database.drop(); });

async function invoke(path: string, method: string, request: Record<string, unknown> = {}, as = userId) {
  const route = meRouter.stack.find(layer => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { data = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
  await route.stack[0].handle({ userId: as, query: {}, params: {}, body: {}, ...request } as any, response as any, () => {});
  return { status, data };
}
const patchBody = (body: Record<string, unknown>) => invoke('/body', 'patch', { body });

test('targets need the full profile, then follow it', async () => {
  let res = await invoke('/targets', 'get');
  assert.deepEqual({ ready: res.data.ready, missing: res.data.missing, water: res.data.waterMl }, { ready: false, missing: ['sex', 'birthYear', 'heightCm', 'weightKg', 'activityLevel'], water: 2000 });

  const year = new Date().getUTCFullYear();
  res = await patchBody({ heightCm: 175, weightKg: 66, targetWeightKg: 80, sex: 'male', birthYear: year - 28, activityLevel: 'moderate', goalWeeks: 20 });
  assert.equal(res.status, 200);
  assert.deepEqual({ sex: res.data.body.sex, activity: res.data.body.activityLevel, weeks: res.data.body.goalWeeks }, { sex: 'male', activity: 'moderate', weeks: 20 });

  res = await invoke('/targets', 'get');
  assert.equal(res.data.ready, true);
  assert.equal(res.data.direction, 'gain');
  assert.equal(res.data.timeline.weeks, 28);
  assert.equal(res.data.waterMl, 2300);
});

test('profile values are validated', async () => {
  const year = new Date().getUTCFullYear();
  for (const bad of [{ sex: 'other' }, { birthYear: year - 5 }, { birthYear: 1800 }, { activityLevel: 'extreme' }, { goalWeeks: 0 }, { goalWeeks: 2.5 }, { unknown: 1 }]) {
    assert.equal((await patchBody(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await patchBody({ sex: null, goalWeeks: null })).status, 200);
});

test('water: add, total, undo, and other users cannot touch it', async () => {
  let res = await invoke('/water/:date', 'post', { params: { date: today }, body: { amountMl: 250 } });
  assert.equal(res.status, 201);
  res = await invoke('/water/:date', 'post', { params: { date: today }, body: { amountMl: 500 } });
  assert.equal(res.data.totalMl, 750);
  assert.equal(res.data.goalMl, 2000);
  assert.equal(res.data.entries.length, 2);
  const last = res.data.entries.at(-1)._id;

  assert.equal((await invoke('/water/entries/:id', 'delete', { params: { id: last } }, otherId)).status, 404);
  assert.equal((await invoke('/water/:date', 'get', { params: { date: today } }, otherId)).data.totalMl, 0);

  res = await invoke('/water/entries/:id', 'delete', { params: { id: last } });
  assert.equal(res.data.totalMl, 250);
  assert.equal((await invoke('/water/entries/:id', 'delete', { params: { id: last } })).status, 404);
  assert.equal((await invoke('/water/entries/:id', 'delete', { params: { id: 'nope' } })).status, 404);

  // Another day is separate; far-future dates and silly amounts are refused
  assert.equal((await invoke('/water/:date', 'get', { params: { date: addDays(today, -1) } })).data.totalMl, 0);
  for (const [date, amountMl] of [[addDays(today, 3), 250], [today, 10], [today, 5000], ['2026-13-01', 250]] as const) {
    assert.equal((await invoke('/water/:date', 'post', { params: { date }, body: { amountMl } })).status, 400);
  }
});
