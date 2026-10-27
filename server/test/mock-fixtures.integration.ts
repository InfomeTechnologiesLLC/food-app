import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/mysql.js';
import { transaction } from '../src/db/tx.js';
import { userRepo } from '../src/repos/users.js';
import { mealPlanRepo } from '../src/repos/meal-plans.js';
import { foodHistoryRepo } from '../src/repos/food-history.js';
import { pantryRepo } from '../src/repos/pantry.js';
import { workoutPlanRepo, workoutSessionRepo } from '../src/repos/workouts.js';
import { validateWorkout, sessionPayloadSchema } from '../src/domain/exercise.js';
import { undoEntry } from '../src/lib/schedule.js';

test('direct mock fixtures retain credentials, reset the profile and support undo', async () => {
  const database = await createTestDatabase('mealmind_fixture_test');
  try {
    const account = await userRepo.create({ email: 'fixtures@example.test', passwordHash: 'exact-mock-hash', plan: 'plus', diet: 'vegan', pushTokens: ['old-token'] });
    const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: database.url };
    const seed = () => execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/seed-kerala.ts', '--reset', '--confirm'], { env, timeout: 60000, stdio: 'pipe' });
    seed();
    const user = await userRepo.findById(account._id);
    assert.equal(user!.passwordHash, account.passwordHash);
    assert.equal(user!.email, account.email);
    assert.equal(user!.plan, 'free');
    assert.equal(user!.preferences.diet, 'vegetarian');
    assert.equal(user!.training.enabled, true);
    assert.deepEqual(user!.pushTokens, []);
    const plan = await mealPlanRepo.findActive(account._id);
    assert.equal(plan!.days.length, 7);
    assert.equal(plan!.days.flatMap(d => d.meals).length, 21);
    assert.equal(plan!.days[0]!.meals.filter(m => m.eaten).length, 3);
    assert.equal(await foodHistoryRepo.count({ userId: account._id }), 3);
    assert.equal(await pantryRepo.count(account._id), 29);
    const [workout] = await workoutPlanRepo.listForUser(account._id, 1);
    assert.deepEqual(validateWorkout(workout as any, workout!.context as any), []);
    const sessions = await workoutSessionRepo.page(account._id, { limit: 10 });
    assert.equal(sessions.length, 2);
    for (const s of sessions) {
      assert.equal(String(s.planId), workout!._id);
      assert.equal(s.exercises.length, 4);
      assert.ok(s.exercises.every(e => (e.definition as any).category !== 'cardio'));
      const payload = { planId: s.planId, scheduledDate: s.scheduledDate, date: s.date, timezone: s.timezone, title: s.title, startedAt: s.startedAt, finishedAt: s.finishedAt, status: s.status, notes: s.notes, feedback: s.feedback,
        exercises: s.exercises.map(({ definition, ...e }) => e) };
      assert.equal(sessionPayloadSchema.safeParse(payload).success, true);
    }
    const entry = await foodHistoryRepo.findOne({ userId: account._id }, undefined, { withConsumed: true });
    assert.ok(entry!.consumed!.length > 0);
    await transaction(tx => undoEntry(account._id, entry!._id, tx));
    assert.equal((await foodHistoryRepo.findById(entry!._id, account._id))!.reversed, true);
    await userRepo.create({ email: 'second@example.test', passwordHash: 'second-hash' });
    assert.throws(seed);
    assert.equal(await userRepo.count(), 2);
    assert.equal(await mealPlanRepo.count(), 1);
  } finally {
    await database.drop();
  }
});
