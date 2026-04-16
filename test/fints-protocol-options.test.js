import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode exposes FinTS protocol selection including optional 4.0 switch', () => {
	const node = new FintsNode();
	const protocolProp = node.description.properties.find((p) => p.name === 'fintsProtocolMode');
	const preferredHbciVersionProp = node.description.properties.find(
		(p) => p.name === 'preferredHbciVersion',
	);

	assert.ok(protocolProp, 'fintsProtocolMode property should exist');
	assert.equal(protocolProp.type, 'options', 'fintsProtocolMode should be options type');
	assert.equal(protocolProp.default, '3.0', 'fintsProtocolMode should default to 3.0');

	const protocolValues = protocolProp.options.map((option) => option.value);
	assert.ok(protocolValues.includes('3.0'), 'fintsProtocolMode should include 3.0');
	assert.ok(protocolValues.includes('4.x'), 'fintsProtocolMode should include 4.x');

	assert.ok(preferredHbciVersionProp, 'preferredHbciVersion property should exist');
	assert.equal(
		preferredHbciVersionProp.type,
		'options',
		'preferredHbciVersion should be options type',
	);
	assert.equal(
		preferredHbciVersionProp.default,
		'4.1',
		'preferredHbciVersion should default to 4.1',
	);

	const hbciVersionValues = preferredHbciVersionProp.options.map((option) => option.value);
	assert.deepEqual(
		hbciVersionValues,
		['4.1', '4.0'],
		'preferredHbciVersion should expose 4.1 and 4.0',
	);

	assert.ok(
		preferredHbciVersionProp.displayOptions?.show?.fintsProtocolMode,
		'preferredHbciVersion should depend on fintsProtocolMode',
	);
	assert.deepEqual(
		preferredHbciVersionProp.displayOptions.show.fintsProtocolMode,
		['4.x'],
		'preferredHbciVersion should only show for FinTS 4.x mode',
	);
});
