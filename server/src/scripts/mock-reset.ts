import type { Conn } from '../db/client.js';
import { getDb } from '../db/client.js';
import { foodHistory, mealPlans, pantryIngredients, plannedDays, scans, waterLogs, targetChanges, stockOperations, weightLogs, workoutPlans, workoutSessions } from '../db/schema.js';
import { userRepo } from '../repos/users.js';

/** Tables whose rows are kept by a mock reset (login identities and schema bookkeeping). */
const PRESERVED_TABLES = new Set(['users', 'admin_accounts', 'admin_sessions', '__drizzle_migrations']);
export const isMockDataTable = (name: string) => !PRESERVED_TABLES.has(name);

/** User-owned top-level tables. Their child tables (batches, days, meals, sets, ...) are cleared by ON DELETE CASCADE. */
const USER_DATA_TABLES = [mealPlans, foodHistory, pantryIngredients, stockOperations, scans, workoutPlans, workoutSessions, weightLogs, plannedDays, waterLogs, targetChanges];

/** Development fixtures have one account. Retain only its login identity. */
export async function mockResetTarget(email?: string) {
  if (process.env.NODE_ENV !== 'development') throw new Error('Mock reset requires NODE_ENV=development.');
  const accounts = await userRepo.all();
  if (accounts.length !== 1) throw new Error('Mock reset requires exactly one account.');
  const account = accounts[0]!;
  if (email && account.email !== email.toLowerCase()) throw new Error('Account does not match --user.');
  const [rows] = await getDb().execute('SHOW TABLES') as unknown as [Record<string, string>[]];
  const tables = rows.map(row => Object.values(row)[0]!).filter(isMockDataTable);
  return { account, tables };
}
export async function resetMockAccount(target: Awaited<ReturnType<typeof mockResetTarget>>, tx: Conn) {
  for (const table of USER_DATA_TABLES) await tx.delete(table);
  await userRepo.resetToDefaults(target.account._id, tx);
  const account = await userRepo.findById(target.account._id, tx);
  if (!account) throw new Error('Reset account is missing.');
  return account;
}
