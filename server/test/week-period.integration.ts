import 'dotenv/config';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/mysql.js';
import { getDb } from '../src/db/client.js';
import { newId } from '../src/db/ids.js';
import * as schema from '../src/db/schema.js';
import { userRepo } from '../src/repos/users.js';
import { buildPlan, mealPlanRepo } from '../src/repos/meal-plans.js';
import { workoutPlanRepo } from '../src/repos/workouts.js';
import { gemini } from '../src/ai/gemini.js';
import planRouter from '../src/routes/plans.js';
import meRouter from '../src/routes/me.js';
import periodRouter from '../src/routes/period.js';
import exerciseRouter from '../src/routes/exercise.js';
import { calendarToday, addDays } from '../src/lib/calendar.js';
import { DEFAULT_TRAINING } from '../src/domain/exercise.js';

const userId = newId();
const today = calendarToday('UTC');
let database: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { database = await createTestDatabase('mealmind_week_period_test'); });
beforeEach(async () => {
  await getDb().delete(schema.users);
  await userRepo.create({ id: userId, email: 'week@example.test', passwordHash: 'test' });
});
after(async () => { await database.drop(); });

type AnyRouter = typeof planRouter;
async function invoke(router: AnyRouter, path: string, method: string, request: Record<string, unknown> = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { data = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
  await route.stack.at(-1)!.handle({ userId, query: {}, params: {}, body: {}, ...request } as any, response as any, () => {});
  return { status, data };
}
const meal = (type: string, title: string) => ({
  type, title, description: title, prepMinutes: 20, calories: 500, nutrition: { proteinGrams: 25, carbsGrams: 60, fatGrams: 15 },
  ingredients: [{ name: 'rice', quantity: 100, unit: 'g', fromPantry: true }], steps: ['Cook'],
});
const week = (label: string) => ({ text: JSON.stringify({ title: `${label} week`, days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, meals: [
  meal('breakfast', `${label} breakfast ${day}`), meal('lunch', `${label} lunch ${day}`), meal('snack', `${label} snack ${day}`), meal('dinner', `${label} dinner ${day}`)] })) }) });

test('automatic week: 7 days of 4 meals, saved as the active plan, not counted, and not made twice', async (t) => {
  const prompts: string[] = [];
  t.mock.method(gemini.models, 'generateContent', async (req: any) => { prompts.push(String(req.contents)); return week('Auto'); });
  const first = await invoke(planRouter, '/auto', 'post', { body: { timezone: 'UTC' } });
  assert.equal(first.status, 200);
  assert.equal(first.data.days.length, 7);
  assert.deepEqual(first.data.days[0].meals.map((m: any) => m.type), ['breakfast', 'lunch', 'dinner', 'snack']);
  assert.equal(first.data.days[0].date, today);
  assert.equal(first.data.days[6].date, addDays(today, 6));
  assert.match(prompts[0]!, /7-day meal plan with these meals each day: breakfast, lunch, dinner, snack/);
  assert.equal((await userRepo.findById(userId))!.usage.plansThisMonth, 0, 'automatic plans are free for now');
  // A second call returns the same plan without asking the AI again
  const second = await invoke(planRouter, '/auto', 'post', { body: { timezone: 'UTC' } });
  assert.equal(second.data._id, first.data._id);
  assert.equal(prompts.length, 1);
});

test('automatic week replaces a plan that has ended', async (t) => {
  const old = buildPlan({ userId, title: 'Old', startDate: addDays(today, -3), settingsSnapshot: { diet: 'none', allergies: [], goal: 'balanced', budget: 'medium', mealTypes: ['lunch'] },
    days: [{ day: 1, date: addDays(today, -1), meals: [meal('lunch', 'Old lunch') as never] }] });
  old.status = 'active';
  await mealPlanRepo.insert(getDb(), old);
  t.mock.method(gemini.models, 'generateContent', async () => week('New'));
  const res = await invoke(planRouter, '/auto', 'post', { body: { timezone: 'UTC' } });
  assert.equal(res.data.title, 'New week');
  assert.notEqual(res.data._id, old._id);
  assert.equal(await mealPlanRepo.findById(old._id, userId), null);
});

test('target weight is set automatically once height and weight are known, and follows a goal change', async () => {
  await invoke(meRouter, '/preferences', 'patch', { body: { goal: 'muscle_gain' } });
  const body = await invoke(meRouter, '/body', 'patch', { body: { heightCm: 175, weightKg: 66 } });
  assert.equal(body.data.body.targetWeightKg, 69.5);
  // A chosen target is kept
  await invoke(meRouter, '/body', 'patch', { body: { targetWeightKg: 75 } });
  assert.equal((await userRepo.findById(userId))!.body.targetWeightKg, 75);
  // Switching to weight loss makes the old (higher) target wrong, so a new one is suggested
  const changed = await invoke(meRouter, '/preferences', 'patch', { body: { goal: 'weight_loss' } });
  assert.equal(changed.data.body.targetWeightKg, 61.5); // BMI 21.6: down to BMI 20
});

test('period tracking: female only, logs, status, pain and comfort foods', async () => {
  const off = await invoke(periodRouter, '/settings', 'patch', { body: { tracking: true } });
  assert.equal(off.status, 400, 'needs a female profile');
  await userRepo.updateBody(userId, { sex: 'female' });
  const on = await invoke(periodRouter, '/settings', 'patch', { body: { tracking: true, exercise: 'rest', comfortFoods: ['Hot chocolate'] } });
  assert.equal(on.status, 200);
  assert.deepEqual(on.data, { tracking: true, exercise: 'rest', comfortFoods: ['Hot chocolate'], cycleLength: 28, periodLength: 5 });

  const start = addDays(today, -1);
  const logged = await invoke(periodRouter, '/logs', 'post', { body: { startDate: start, today } });
  assert.equal(logged.status, 201);
  assert.equal(logged.data.status.onPeriod, true);
  assert.equal(logged.data.status.dayOfPeriod, 2);
  assert.equal(logged.data.status.nextStart, addDays(start, 28));
  assert.deepEqual(logged.data.comfort.mine, ['Hot chocolate']);
  assert.ok(logged.data.comfort.general.length > 0);

  const pain = await invoke(periodRouter, '/pain/:date', 'put', { params: { date: today }, body: { pain: 'mild' } });
  assert.equal(pain.data.pain, 'mild');
  const again = await invoke(periodRouter, '/pain/:date', 'put', { params: { date: today }, body: { pain: 'strong' } });
  assert.equal(again.data.pain, 'strong', 'one answer per day, the latest wins');

  const id = logged.data.logs[0]._id;
  const ended = await invoke(periodRouter, '/logs/:id', 'patch', { params: { id }, body: { startDate: start, endDate: start, today } });
  assert.equal(ended.data.status.onPeriod, false);
  const future = await invoke(periodRouter, '/logs', 'post', { body: { startDate: addDays(today, 5), today } });
  assert.equal(future.status, 400);
  const removed = await invoke(periodRouter, '/logs/:id', 'delete', { params: { id }, query: { today } });
  assert.equal(removed.data.logs.length, 0);
});

test('period days in the planned week are passed to the meal planner with her comfort foods', async (t) => {
  await userRepo.updateBody(userId, { sex: 'female' });
  await userRepo.updatePeriod(userId, { tracking: true, comfortFoods: ['Ginger tea'] });
  await invoke(periodRouter, '/logs', 'post', { body: { startDate: addDays(today, -27), endDate: addDays(today, -23), today } });
  const prompts: string[] = [];
  t.mock.method(gemini.models, 'generateContent', async (req: any) => { prompts.push(String(req.contents)); return week('Cycle'); });
  await invoke(planRouter, '/auto', 'post', { body: { timezone: 'UTC' } });
  assert.match(prompts[0]!, /SPECIAL DAYS:\n- Days 2, 3, 4, 5, 6 are expected period days/);
  assert.match(prompts[0]!, /"Ginger tea"/);
});

test('changing one exercise swaps it, remembers it if asked and uses one coach request', async (t) => {
  await userRepo.updateTraining(userId, { ...DEFAULT_TRAINING, enabled: true, weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(today, i), title: 'Full body', explanation: 'Strength', exercises: [
    { exerciseId: 'knee-pushup', sets: 2, repsMin: 6, repsMax: 10, durationSeconds: null, restSeconds: 60 }] }));
  const plan = await workoutPlanRepo.create({ userId, title: 'Week', status: 'active', days, context: { startDate: today, timezone: 'UTC', training: { ...DEFAULT_TRAINING, enabled: true, weekdays: [0, 1, 2, 3, 4, 5, 6] }, body: {}, recentSessions: [] } });
  t.mock.method(gemini.models, 'generateContent', async () => ({ text: JSON.stringify({ exerciseId: 'walk', sets: 1, repsMin: null, repsMax: null, durationSeconds: 900, restSeconds: 30, reason: 'A walk instead of push-ups.' }) }));
  const res = await invoke(exerciseRouter, '/plans/:id/change', 'post', { params: { id: plan._id }, body: { date: today, index: 0, request: 'no push-ups please', remember: true, revision: plan.__v } });
  assert.equal(res.status, 200);
  assert.equal(res.data.plan.days[0].exercises[0].exerciseId, 'walk');
  assert.equal(res.data.plan.days[1].exercises[0].exerciseId, 'knee-pushup');
  assert.equal(res.data.reason, 'A walk instead of push-ups.');
  const user = (await userRepo.findById(userId))!;
  assert.deepEqual(user.training.excludedExercises, ['knee-pushup']);
  assert.equal(user.usage.coachThisMonth, 1);
  // Stale revision: refused, nothing used
  const stale = await invoke(exerciseRouter, '/plans/:id/change', 'post', { params: { id: plan._id }, body: { date: today, index: 0, request: 'something else', revision: plan.__v } });
  assert.equal(stale.status, 409);
  assert.equal((await userRepo.findById(userId))!.usage.coachThisMonth, 1);
});

test('exercise days: up to 7 days are allowed and saving them marks the days as chosen', async () => {
  assert.equal((await userRepo.findById(userId))!.trainingDaysChosen, false);
  const res = await invoke(meRouter, '/training', 'patch', { body: { ...DEFAULT_TRAINING, enabled: true, weekdays: [0, 1, 2, 3, 4, 5, 6] } });
  assert.equal(res.status, 200);
  assert.equal(res.data.trainingDaysChosen, true);
  assert.deepEqual(res.data.training.weekdays, [0, 1, 2, 3, 4, 5, 6]);
  const none = await invoke(meRouter, '/training', 'patch', { body: { ...DEFAULT_TRAINING, enabled: true, weekdays: [] } });
  assert.equal(none.status, 400);
});
