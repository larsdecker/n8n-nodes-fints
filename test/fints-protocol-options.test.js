import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode exposes a single FinTS protocol parameter with 3.0 and 4.1 options', () => {
	const node = new FintsNode();

	const protocolProp = node.description.properties.find((p) => p.name === 'fintsProtocol');
	assert.ok(protocolProp, 'fintsProtocol property should exist');
	assert.equal(protocolProp.type, 'options', 'fintsProtocol should be options type');
	assert.equal(protocolProp.default, '3.0', 'fintsProtocol should default to 3.0');

	const values = protocolProp.options.map((o) => o.value);
	assert.deepEqual(values, ['3.0', '4.1'], 'fintsProtocol should only expose 3.0 and 4.1');

	assert.ok(
		!node.description.properties.find((p) => p.name === 'preferredHbciVersion'),
		'preferredHbciVersion parameter should not exist (merged into fintsProtocol)',
	);

	assert.ok(
		!node.description.properties.find((p) => p.name === 'fintsProtocolMode'),
		'fintsProtocolMode (old name) should not exist',
	);
});
