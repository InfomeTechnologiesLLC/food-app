import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMockDataCollection } from '../src/scripts/mock-reset.js';

test('mock account reset retains admin identities and sessions', () => {
  assert.equal(isMockDataCollection('adminaccounts'), false);
  assert.equal(isMockDataCollection('adminsessions'), false);
  assert.equal(isMockDataCollection('users'), false);
  assert.equal(isMockDataCollection('scans'), true);
  assert.equal(isMockDataCollection('system.indexes'), false);
});
