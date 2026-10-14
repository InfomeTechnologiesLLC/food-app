import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { MealPlan } from '../src/models/MealPlan.js';
import { FoodHistory } from '../src/models/FoodHistory.js';
import { PantryIngredient } from '../src/models/PantryIngredient.js';
import { WorkoutPlan, WorkoutSession } from '../src/models/Workout.js';
import { validateWorkout, sessionPayloadSchema } from '../src/domain/exercise.js';
import { undoEntry } from '../src/lib/schedule.js';

test('direct mock fixtures retain credentials, clear retired data and support undo', async () => {
  const uri = new URL(process.env.MONGODB_URI!);
  uri.pathname = `/mealmind_fixture_test_${Date.now()}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 10000 });
  try {
    await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
    const account = await User.create({ email: 'fixtures@example.test', passwordHash: 'exact-mock-hash', plan: 'plus', preferences: { diet: 'vegan' }, pushTokens: ['old-token'] });
    await User.collection.updateOne({ _id: account._id }, { $set: { obsoleteField: 'old' } });
    await mongoose.connection.collection('exercisedefinitions').insertOne({ stale: true });
    await mongoose.connection.collection('retiredmockdata').insertOne({ stale: true });
    const env = { ...process.env, NODE_ENV: 'development', MONGODB_URI: uri.toString() };
    const seed = () => execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/seed-kerala.ts', '--reset', '--confirm'], { env, timeout: 60000, stdio: 'pipe' });
    seed();
    const user = await User.findById(account._id).lean();
    assert.equal(user!.passwordHash, account.passwordHash);
    assert.equal(user!.email, account.email);
    assert.equal(user!.plan, 'free');
    assert.equal(user!.preferences!.diet, 'vegetarian');
    assert.equal(user!.training!.enabled, true);
    assert.deepEqual(user!.pushTokens, []);
    assert.equal((user as any).obsoleteField, undefined);
    assert.equal(await mongoose.connection.collection('retiredmockdata').countDocuments(), 0);
    assert.equal(await mongoose.connection.db!.listCollections({ name: 'exercisedefinitions' }).hasNext(), false);
    const plan = await MealPlan.findOne({ userId: account._id });
    assert.equal(plan!.days.length, 7);
    assert.equal(plan!.days.flatMap(d => d.meals).length, 21);
    assert.equal(plan!.days[0].meals.filter(m => m.eaten).length, 3);
    assert.equal(await FoodHistory.countDocuments({ userId: account._id }), 3);
    assert.equal(await PantryIngredient.countDocuments({ userId: account._id }), 29);
    const workout = await WorkoutPlan.findOne({ userId: account._id });
    assert.deepEqual(validateWorkout(workout!.toObject() as any, workout!.context as any), []);
    const sessions = await WorkoutSession.find({ userId: account._id }).lean();
    assert.equal(sessions.length, 2);
    for (const s of sessions) {
      assert.equal(String(s.planId), workout!.id);
      assert.equal(s.exercises.length, 4);
      assert.ok(s.exercises.every(e => e.definition.category !== 'cardio'));
      const payload = { planId: s.planId, scheduledDate: s.scheduledDate, date: s.date, timezone: s.timezone, title: s.title, startedAt: s.startedAt, finishedAt: s.finishedAt, status: s.status, notes: s.notes, feedback: s.feedback,
        exercises: s.exercises.map(({ definition, ...e }) => e) };
      assert.equal(sessionPayloadSchema.safeParse(payload).success, true);
    }
    const entry = await FoodHistory.findOne({ userId: account._id }).select('+consumed');
    assert.ok(entry!.consumed.length > 0);
    await mongoose.connection.transaction(session => undoEntry(account.id, entry!.id, session));
    assert.equal((await FoodHistory.findById(entry!._id))!.reversed, true);
    await User.create({ email: 'second@example.test', passwordHash: 'second-hash' });
    assert.throws(seed);
    assert.equal(await User.countDocuments(), 2);
    assert.equal(await MealPlan.countDocuments(), 1);
  } finally {
    try { await mongoose.connection.db!.dropDatabase(); } finally { await mongoose.disconnect(); }
  }
});
