import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMockDataTable } from '../src/scripts/mock-reset.js';

test('mock account reset retains admin identities and sessions', () => {
  assert.equal(isMockDataTable('admin_accounts'), false);
  assert.equal(isMockDataTable('admin_sessions'), false);
  assert.equal(isMockDataTable('users'), false);
  assert.equal(isMockDataTable('__drizzle_migrations'), false);
  assert.equal(isMockDataTable('scans'), true);
  assert.equal(isMockDataTable('pantry_batches'), true);
});
