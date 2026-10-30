import 'dotenv/config';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/mysql.js';
import { getDb } from '../src/db/client.js';
import { newId } from '../src/db/ids.js';
import * as schema from '../src/db/schema.js';
import { userRepo } from '../src/repos/users.js';
import { buildPlan, mealPlanRepo } from '../src/repos/meal-plans.js';
import { gemini } from '../src/ai/gemini.js';
import planRouter from '../src/routes/plans.js';
import meRouter from '../src/routes/me.js';
import { calendarToday, addDays } from '../src/lib/calendar.js';

const userId = newId();
const today = calendarToday('UTC');
let database: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { database = await createTestDatabase('mealmind_meal_change_test'); });
beforeEach(async () => {
  await getDb().delete(schema.users);
  await userRepo.create({ id: userId, email: 'change@example.test', passwordHash: 'test' });
  await userRepo.updatePreferences(userId, { diet: 'non_vegetarian', cuisine: 'India', dislikes: ['brinjal'] });
});
after(async () => { await database.drop(); });

async function invoke(router: typeof planRouter, path: string, method: string, request: Record<string, unknown> = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { data = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
  await route.stack.at(-1)!.handle({ userId, query: {}, params: {}, body: {}, ...request } as any, response as any, () => {});
  return { status, data };
}
const meal = (type: string, title: string, ingredients: string[]) => ({
  type, title, description: title, prepMinutes: 20, calories: 500, nutrition: { proteinGrams: 20, carbsGrams: 60, fatGrams: 15 },
  ingredients: ingredients.map((name) => ({ name, quantity: 100, unit: 'g', fromPantry: false })), steps: ['Cook'],
});
async function makePlan(dayOffset = 0) {
  const plan = buildPlan({ userId, title: 'Test plan', startDate: today, settingsSnapshot: { diet: 'none', allergies: [], goal: 'balanced', budget: 'medium', mealTypes: ['breakfast', 'lunch'] },
    days: [{ day: 1, date: addDays(today, dayOffset), meals: [meal('breakfast', 'Chapathi with potato curry', ['wheat flour', 'potato']) as never, meal('lunch', 'Rice and dal', ['rice', 'dal']) as never] }] });
  plan.status = 'active';
  return mealPlanRepo.insert(getDb(), plan);
}
const json = (v: unknown) => ({ text: JSON.stringify(v) });
const reply = (title: string, ingredients: string[]) => json({ ...meal('breakfast', title, ingredients), type: 'breakfast' });

test('changes one meal from the request, keeps the other, remembers dislikes and counts one AI request', async (t) => {
  const plan = await makePlan();
  const requests: any[] = [];
  const answers = [reply('Chapathi with brinjal curry', ['wheat flour', 'brinjal']), reply('Chapathi with egg curry', ['wheat flour', 'egg', 'onion'])];
  t.mock.method(gemini.models, 'generateContent', async (req: any) => { requests.push(req); return answers.shift(); });
  const breakfast = plan.days[0]!.meals[0]!;
  const res = await invoke(planRouter, '/:id/meals/:mealId/change', 'post', {
    params: { id: plan._id, mealId: breakfast._id },
    body: { request: "I don't like potato, use egg", avoid: ['potato'], remember: true, revision: plan.__v, timezone: 'UTC' },
  });
  assert.equal(res.status, 200);
  const meals = res.data.days[0].meals;
  assert.equal(meals[0].title, 'Chapathi with egg curry');
  assert.notEqual(meals[0]._id, breakfast._id);
  assert.equal(meals[1].title, 'Rice and dal');
  assert.match(requests[0].contents, /I don't like potato, use egg/);
  assert.match(requests[0].contents, /home cooking from "India"/);
  assert.match(requests[0].contents, /"brinjal", "potato"/);
  assert.match(requests[1].contents, /used brinjal/); // retried after a disliked food
  const user = (await userRepo.findById(userId))!;
  assert.deepEqual(user.preferences.dislikes, ['brinjal', 'potato']);
  assert.equal(user.usage.coachThisMonth, 1);
});

test('refuses stale, eaten or past meals, and refunds AI failures', async (t) => {
  const plan = await makePlan();
  const mealId = plan.days[0]!.meals[0]!._id;
  const body = { request: 'use egg', revision: plan.__v + 5, timezone: 'UTC' };
  assert.equal((await invoke(planRouter, '/:id/meals/:mealId/change', 'post', { params: { id: plan._id, mealId }, body })).status, 409);
  t.mock.method(gemini.models, 'generateContent', async () => { throw new Error('down'); });
  const failed = await invoke(planRouter, '/:id/meals/:mealId/change', 'post', { params: { id: plan._id, mealId }, body: { ...body, revision: plan.__v } });
  assert.equal(failed.status, 502);
  assert.equal((await userRepo.findById(userId))!.usage.coachThisMonth, 0);
  await getDb().delete(schema.mealPlans);
  const past = await makePlan(-1);
  const pastRes = await invoke(planRouter, '/:id/meals/:mealId/change', 'post', { params: { id: past._id, mealId: past.days[0]!.meals[0]!._id }, body: { ...body, revision: past.__v } });
  assert.equal(pastRes.status, 409);
  assert.equal((await invoke(planRouter, '/:id/meals/:mealId/change', 'post', { params: { id: past._id, mealId: 'nope' }, body })).status, 400);
});

test('preferences accept the new diets, a cuisine and dislikes, and validate them', async () => {
  const ok = await invoke(meRouter, '/preferences', 'patch', { body: { diet: 'eggetarian', cuisine: 'Sri Lanka', dislikes: ['Okra', 'bitter gourd'] } });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.data.preferences.diet, ok.data.preferences.cuisine, ok.data.preferences.dislikes], ['eggetarian', 'Sri Lanka', ['okra', 'bitter gourd']]);
  assert.equal((await invoke(meRouter, '/preferences', 'patch', { body: { cuisine: null } })).data.preferences.cuisine, null);
  for (const bad of [{ diet: 'carnivore' }, { cuisine: 'x' }, { dislikes: Array.from({ length: 31 }, (_, i) => `f${i}`) }]) {
    assert.equal((await invoke(meRouter, '/preferences', 'patch', { body: bad })).status, 400, JSON.stringify(bad));
  }
});

test('water per day for a range', async () => {
  const water = (date: string, amountMl: number) => invoke(meRouter, '/water/:date', 'post', { params: { date }, body: { amountMl } });
  await water(today, 500); await water(today, 250); await water(addDays(today, -2), 1000);
  const res = await invoke(meRouter, '/water', 'get', { query: { from: addDays(today, -6), to: today } });
  assert.deepEqual(res.data.days, [{ date: addDays(today, -2), totalMl: 1000 }, { date: today, totalMl: 750 }]);
  assert.equal(res.data.goalMl, 2000);
  assert.equal((await invoke(meRouter, '/water', 'get', { query: { from: today, to: addDays(today, -1) } })).status, 400);
});
