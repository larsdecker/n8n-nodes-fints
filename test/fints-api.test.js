import assert from 'node:assert/strict';
import { FintsApi } from '../dist/credentials/FintsApi.credentials.js';
import { test } from 'node:test';

test('FintsApi exposes userId and pin properties', () => {
  const creds = new FintsApi();
  assert.equal(creds.name, 'fintsApi');
  const propNames = creds.properties.map(p => p.name);
  assert.ok(propNames.includes('userId'), 'userId property missing');
  assert.ok(propNames.includes('pin'), 'pin property missing');
});
