import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Transaction mapping includes optional Firefly III nested fields', async () => {
  // Import the compiled node module
  const { FintsNode } = await import('../dist/nodes/FintsNode/FintsNode.node.js');
  
  const node = new FintsNode();
  
  // Verify the node has the includeFireflyFields option
  const fireflyOption = node.description.properties.find(p => p.name === 'includeFireflyFields');
  assert.ok(fireflyOption, 'Node should have includeFireflyFields option');
  assert.equal(fireflyOption.type, 'boolean', 'includeFireflyFields should be boolean');
  assert.equal(fireflyOption.default, false, 'includeFireflyFields should default to false');
  
  // Verify the node description is properly configured
  assert.ok(node.description, 'Node description should exist');
  assert.equal(node.description.name, 'fintsNode', 'Node name should be fintsNode');
  assert.ok(node.execute, 'Execute function should exist');
  assert.equal(typeof node.execute, 'function', 'Execute should be a function');
});

test('Documentation describes Firefly III nested field structure', async () => {
  const fs = await import('node:fs/promises');
  const readme = await fs.readFile('./README.md', 'utf8');
  
  // Verify the README contains Firefly III integration section
  assert.ok(readme.includes('Firefly III Integration'), 'README should have Firefly III Integration section');
  assert.ok(readme.includes('Include Firefly III Fields'), 'README should document the option to enable fields');
  assert.ok(readme.includes('"firefly"'), 'README should show nested firefly object');
  assert.ok(readme.includes('transactionId'), 'README should document transactionId field');
  assert.ok(readme.includes('transactionType'), 'README should document transactionType field');
  assert.ok(readme.includes('sendingAccount'), 'README should document sendingAccount field');
  assert.ok(readme.includes('targetAccount'), 'README should document targetAccount field');
  assert.ok(readme.includes('endToEndRef'), 'README should document endToEndRef field');
  assert.ok(readme.includes('sepa_ct_id'), 'README should mention sepa_ct_id mapping');
});

test('Node properties include Firefly III option after date fields', async () => {
  const { FintsNode } = await import('../dist/nodes/FintsNode/FintsNode.node.js');
  
  const node = new FintsNode();
  const properties = node.description.properties;
  
  // Find indices of relevant properties
  const endDateIndex = properties.findIndex(p => p.name === 'endDate');
  const fireflyIndex = properties.findIndex(p => p.name === 'includeFireflyFields');
  
  assert.ok(endDateIndex >= 0, 'endDate property should exist');
  assert.ok(fireflyIndex >= 0, 'includeFireflyFields property should exist');
  assert.ok(fireflyIndex > endDateIndex, 'includeFireflyFields should come after endDate');
});
