import mongoose from 'mongoose';
import { env } from '../env.js';
if (env.NODE_ENV !== 'development') throw new Error('This cleanup is for the development database only.');
await mongoose.connect(env.MONGODB_URI);
try {
  const result = await mongoose.connection.collection('mealplans').deleteMany({ status: { $ne: 'active' } });
  console.log(`Removed ${result.deletedCount} saved meal drafts; kept current plans and history.`);
} finally { await mongoose.disconnect(); }
