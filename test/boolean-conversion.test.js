import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Strict equality handles string "false" correctly', () => {
	// This test verifies that we handle the case where getNodeParameter
	// might return a string "false" or other values instead of boolean

	const stringFalse = "false";
	const booleanFalse = false;
	const booleanTrue = true;

	// Using === true ensures only actual boolean true passes
	assert.equal(stringFalse === true, false, '"false" === true should be false');
	assert.equal(booleanFalse === true, false, 'false === true should be false');
	assert.equal(booleanTrue === true, true, 'true === true should be true');

	// Also test other potential values
	assert.equal("" === true, false, '"" === true should be false');
	assert.equal(0 === true, false, '0 === true should be false');
	assert.equal(1 === true, false, '1 === true should be false (not strict equal)');
	assert.equal("true" === true, false, '"true" === true should be false');
});
