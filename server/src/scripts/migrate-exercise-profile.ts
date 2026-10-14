import mongoose from 'mongoose';
import { env } from '../env.js';
import { DEFAULT_TRAINING, EXERCISES } from '../domain/exercise.js';
if (env.NODE_ENV !== 'development') throw new Error('This migration is for the development database only.');
await mongoose.connect(env.MONGODB_URI);
try {
  await mongoose.connection.transaction(async session => {
    const users = mongoose.connection.collection('users');
    for (const user of await users.find({}, { session }).toArray()) {
      const prefs = user.preferences ?? {};
      await users.updateOne({ _id: user._id }, {
        $set: { body: user.body ?? { heightCm: prefs.heightCm ?? null, weightKg: prefs.weightKg ?? null, weightUpdatedAt: prefs.weightUpdatedAt ?? null }, training: user.training ?? DEFAULT_TRAINING,
          'preferences.goal': prefs.goal === 'budget' ? 'balanced' : prefs.goal ?? 'balanced' },
        $unset: { 'preferences.heightCm': '', 'preferences.weightKg': '', 'preferences.weightUpdatedAt': '' },
      }, { session });
    }
    const plans = mongoose.connection.collection('mealplans');
    for (const plan of await plans.find({}, { session }).toArray()) {
      const prefs = plan.settingsSnapshot ?? {};
      await plans.updateOne({ _id: plan._id }, { $set: { 'settingsSnapshot.body': prefs.body ?? { heightCm: prefs.heightCm ?? null, weightKg: prefs.weightKg ?? null, weightUpdatedAt: prefs.weightUpdatedAt ?? null },
        'settingsSnapshot.trainingContext': prefs.trainingContext ?? null, 'settingsSnapshot.goal': prefs.goal === 'budget' ? 'balanced' : prefs.goal ?? 'balanced' },
        $unset: { 'settingsSnapshot.heightCm': '', 'settingsSnapshot.weightKg': '', 'settingsSnapshot.weightUpdatedAt': '' } }, { session });
    }
    const definitions = mongoose.connection.collection('exercisedefinitions');
    for (const exercise of EXERCISES) await definitions.updateOne({ id: exercise.id }, { $set: exercise }, { upsert: true, session });
  });
  console.log('Migrated food/body/training profiles and meal snapshots; seeded exercise definitions.');
} finally { await mongoose.disconnect(); }
