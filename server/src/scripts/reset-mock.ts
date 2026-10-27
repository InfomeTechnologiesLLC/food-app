import 'dotenv/config';
import { connectDb, closeDb } from '../db/client.js';
import { transaction } from '../db/tx.js';
import { mockResetTarget, resetMockAccount } from './mock-reset.js';
if (process.env.NODE_ENV !== 'development' || !process.argv.includes('--confirm')) {
  throw new Error('Mock reset requires NODE_ENV=development and --confirm. Only account ID, email and password hash are preserved.');
}
await connectDb();
try {
  const target = await mockResetTarget();
  await transaction(tx => resetMockAccount(target, tx));
  console.log('Cleared all mock data and reset account defaults. Login identity preserved.');
} finally { await closeDb(); }
