import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode has debugMode property', async () => {
	const node = new FintsNode();
	const debugModeProp = node.description.properties.find((p) => p.name === 'debugMode');
	assert.ok(debugModeProp, 'debugMode property should exist');
	assert.equal(debugModeProp.type, 'boolean', 'debugMode should be a boolean');
	assert.equal(debugModeProp.default, false, 'debugMode should default to false');
	assert.ok(
		debugModeProp.description.includes('debug'),
		'debugMode description should mention debug',
	);
	assert.ok(
		debugModeProp.description.includes('_debug'),
		'debugMode description should mention _debug property',
	);
});
