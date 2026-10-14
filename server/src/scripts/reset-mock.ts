import 'dotenv/config';
import mongoose from 'mongoose';
import { mockResetTarget, resetMockAccount, dropRetiredCollections } from './mock-reset.js';
if (process.env.NODE_ENV !== 'development' || !process.argv.includes('--confirm')) {
  throw new Error('Mock reset requires NODE_ENV=development and --confirm. Only account ID, email and password hash are preserved.');
}
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const target = await mockResetTarget();
  await mongoose.connection.transaction(session => resetMockAccount(target, session));
  await dropRetiredCollections();
  console.log('Cleared all mock data and reset account defaults. Login identity preserved.');
} finally { await mongoose.disconnect(); }
