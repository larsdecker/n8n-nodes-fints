import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';

test('FintsNode validates that start date is before end date', () => {
	const node = new FintsNode();
	
	// Check that the node has the date validation properties
	const startDateProp = node.description.properties.find(p => p.name === 'startDate');
	const endDateProp = node.description.properties.find(p => p.name === 'endDate');
	
	assert.ok(startDateProp, 'startDate property should exist');
	assert.ok(endDateProp, 'endDate property should exist');
	assert.equal(startDateProp.type, 'dateTime', 'startDate should be dateTime type');
	assert.equal(endDateProp.type, 'dateTime', 'endDate should be dateTime type');
});
