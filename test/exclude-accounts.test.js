import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode has excludeAccounts parameter with correct properties', () => {
	const node = new FintsNode();
	const excludeAccountsProp = node.description.properties.find((p) => p.name === 'excludeAccounts');

	assert.ok(excludeAccountsProp, 'excludeAccounts property should exist');
	assert.equal(excludeAccountsProp.displayName, 'Exclude IBANs/Account Numbers');
	assert.equal(excludeAccountsProp.type, 'string');
	assert.equal(excludeAccountsProp.default, '');
	assert.ok(
		excludeAccountsProp.description.includes('Comma-separated'),
		'Description should mention comma-separated',
	);

	// Check displayOptions
	assert.ok(excludeAccountsProp.displayOptions, 'displayOptions should be defined');
	assert.ok(excludeAccountsProp.displayOptions.show, 'displayOptions.show should be defined');
	assert.deepEqual(
		excludeAccountsProp.displayOptions.show.resource,
		['account'],
		'Should show when resource is account',
	);
	assert.deepEqual(
		excludeAccountsProp.displayOptions.show.operation,
		['getStatements'],
		'Should show when operation is getStatements',
	);
});
