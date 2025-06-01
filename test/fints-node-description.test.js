import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode has correct description properties', () => {
  const node = new FintsNode();
  assert.equal(node.description.displayName, 'FinTS Account Balance');
  assert.equal(node.description.name, 'fintsNode');
  const cred = node.description.credentials.find(c => c.name === 'fintsApi');
  assert.ok(cred, 'fintsApi credentials missing');
});
