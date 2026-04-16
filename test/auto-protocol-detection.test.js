import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PinError, AuthenticationError } from 'fints-lib';

// Verify that fints-lib exports the error classes needed for PIN error distinction
test('fints-lib exports PinError for PIN error handling', () => {
	assert.ok(typeof PinError === 'function', 'PinError should be exported from fints-lib');
	const err = new PinError('wrong pin', '9340');
	assert.ok(err instanceof PinError, 'PinError should be an instanceof PinError');
	assert.ok(err instanceof Error, 'PinError should be an instanceof Error');
	assert.equal(err.code, '9340', 'PinError should carry the FinTS error code');
});

test('fints-lib exports AuthenticationError for other auth failures', () => {
	assert.ok(
		typeof AuthenticationError === 'function',
		'AuthenticationError should be exported from fints-lib',
	);
	const err = new AuthenticationError('locked', '9900');
	assert.ok(
		err instanceof AuthenticationError,
		'AuthenticationError should be instanceof AuthenticationError',
	);
	assert.ok(err instanceof Error, 'AuthenticationError should be instanceof Error');
});

test('PinError and AuthenticationError are distinguishable from generic errors', () => {
	const pin = new PinError('bad pin');
	const auth = new AuthenticationError('account locked');
	const generic = new Error('network timeout');

	assert.ok(pin instanceof PinError, 'PinError instanceof check works');
	assert.ok(!(generic instanceof PinError), 'generic Error is not PinError');
	assert.ok(auth instanceof AuthenticationError, 'AuthenticationError instanceof check works');
	assert.ok(!(generic instanceof AuthenticationError), 'generic Error is not AuthenticationError');
	// PinError is not an AuthenticationError (they are sibling classes)
	assert.ok(!(pin instanceof AuthenticationError), 'PinError is not AuthenticationError');
});

test('FintsNode auto option is present in the fintsProtocol dropdown', async () => {
	const { FintsNode } = await import('../dist/nodes/FintsNode/FintsNode.node.js');
	const node = new FintsNode();
	const protocolProp = node.description.properties.find((p) => p.name === 'fintsProtocol');
	assert.ok(protocolProp, 'fintsProtocol property should exist');
	const values = protocolProp.options.map((o) => o.value);
	assert.ok(values.includes('auto'), "'auto' should be an available protocol option");
	// 'auto' must not be the default to avoid breaking existing workflows
	assert.equal(protocolProp.default, '3.0', "default should remain '3.0' for backward compatibility");
});
