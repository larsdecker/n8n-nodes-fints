import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';

test('FintsNode has expert mode with BLZ and URL validation', () => {
	const node = new FintsNode();
	
	// Check expert mode exists
	const expertModeProp = node.description.properties.find(p => p.name === 'expertMode');
	assert.ok(expertModeProp, 'expertMode property should exist');
	assert.equal(expertModeProp.type, 'boolean', 'expertMode should be boolean type');
	
	// Check BLZ field exists
	const blzProp = node.description.properties.find(p => p.name === 'blz');
	assert.ok(blzProp, 'blz property should exist');
	assert.equal(blzProp.type, 'string', 'blz should be string type');
	
	// Check FinTS URL field exists
	const fintsUrlProp = node.description.properties.find(p => p.name === 'fintsUrl');
	assert.ok(fintsUrlProp, 'fintsUrl property should exist');
	assert.equal(fintsUrlProp.type, 'string', 'fintsUrl should be string type');
	
	// Verify these fields are only shown in expert mode
	assert.ok(blzProp.displayOptions?.show?.expertMode, 'blz should only show in expert mode');
	assert.ok(fintsUrlProp.displayOptions?.show?.expertMode, 'fintsUrl should only show in expert mode');
});
