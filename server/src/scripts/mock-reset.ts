import mongoose, { type ClientSession } from 'mongoose';
import { User } from '../models/User.js';

export const isMockDataCollection = (name: string) => !name.startsWith('system.') && name !== User.collection.name && name !== 'adminaccounts' && name !== 'adminsessions';

/** Development fixtures have one account. Retain only its login identity. */
export async function mockResetTarget(email?: string) {
  if (process.env.NODE_ENV !== 'development') throw new Error('Mock reset requires NODE_ENV=development.');
  const accounts = await User.find({}).lean();
  if (accounts.length !== 1) throw new Error('Mock reset requires exactly one account.');
  const account = accounts[0];
  if (email && account.email !== email.toLowerCase()) throw new Error('Account does not match --user.');
  const collections = (await mongoose.connection.db!.listCollections().toArray()).map(c => c.name).filter(isMockDataCollection);
  return { account, collections };
}
export async function resetMockAccount(target: Awaited<ReturnType<typeof mockResetTarget>>, session: ClientSession) {
  for (const name of target.collections) await mongoose.connection.collection(name).deleteMany({}, { session });
  const { _id, email, passwordHash } = target.account;
  const fresh = new User({ _id, email, passwordHash });
  await fresh.validate();
  await User.collection.replaceOne({ _id }, fresh.toObject(), { session });
  const account = await User.findById(_id).session(session);
  if (!account) throw new Error('Reset account is missing.');
  return account;
}
export async function dropRetiredCollections() {
  for (const name of ['pantryitems', 'exercisedefinitions']) {
    if (await mongoose.connection.db!.listCollections({ name }).hasNext()) await mongoose.connection.collection(name).drop();
  }
}
