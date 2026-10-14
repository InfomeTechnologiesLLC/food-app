import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalStore } from '../../mobile/src/lib/local-store-core.ts';
function open(path: string) {
  const db = new DatabaseSync(path);
  const store = createLocalStore({ execSync: sql => db.exec(sql), getFirstSync: <T>(sql: string, ...params: string[]) => db.prepare(sql).get(...params) as T ?? null, runSync: (sql, ...params) => db.prepare(sql).run(...params) });
  return { db, store };
}
test('SQLite persists active session, instructions, timer and pending operation across reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mealmind-workout-')); const path = join(directory, 'workout.db');
  try {
    let { db, store } = open(path);
    const session = { status: 'in_progress', exercises: [{ instructions: ['Walk comfortably'], sets: [{ durationSeconds: 600, status: 'completed' }] }], pending: true, delivery: { operationId: 'request-before-offline' } };
    store.write('account-a', 'sessions', [session]); store.write('account-a', 'rest:session', 1791870000000); db.close();
    ({ db, store } = open(path)); assert.deepEqual(store.read('account-a', 'sessions'), [session]); assert.equal(store.read('account-a', 'rest:session'), 1791870000000); db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('account partitions and auth-cache removal leave other accounts and unsynced workouts intact', () => {
  const { db, store } = open(':memory:');
  try {
    store.write('account-a', 'sessions', ['private-a']); store.write('account-b', 'sessions', ['private-b']); store.write('auth', 'user', { _id: 'account-a' });
    assert.equal(store.read('account-c', 'sessions'), null);
    assert.deepEqual(store.read('account-b', 'sessions'), ['private-b']);
    store.remove('auth', 'user'); assert.equal(store.read('auth', 'user'), null); assert.deepEqual(store.read('account-a', 'sessions'), ['private-a']);
    store.write('account-a', 'sessions', ['new-a']); assert.deepEqual(store.read('account-a', 'sessions'), ['new-a']); assert.deepEqual(store.read('account-b', 'sessions'), ['private-b']);
  } finally { db.close(); }
});
