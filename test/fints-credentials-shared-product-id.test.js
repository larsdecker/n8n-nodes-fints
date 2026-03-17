import assert from 'node:assert/strict';
import { FintsApi } from '../dist/credentials/FintsApi.credentials.js';
import { test } from 'node:test';

test('FintsApi exposes new shared product ID credential fields', () => {
	const creds = new FintsApi();
	const propNames = creds.properties.map((p) => p.name);

	// Original fields must still exist
	assert.ok(propNames.includes('userId'), 'userId property missing');
	assert.ok(propNames.includes('pin'), 'pin property missing');

	// New fields
	assert.ok(propNames.includes('productRegistrationId'), 'productRegistrationId property missing');
	assert.ok(propNames.includes('useSharedProductId'), 'useSharedProductId property missing');
	assert.ok(propNames.includes('installationApiKey'), 'installationApiKey property missing');
	assert.ok(propNames.includes('productIdServiceUrl'), 'productIdServiceUrl property missing');
	assert.ok(
		propNames.includes('productIdServiceHmacSecret'),
		'productIdServiceHmacSecret property missing',
	);
});

test('FintsApi credential fields have correct types', () => {
	const creds = new FintsApi();
	const getProp = (name) => creds.properties.find((p) => p.name === name);

	assert.equal(getProp('productRegistrationId').type, 'string');
	assert.equal(getProp('useSharedProductId').type, 'boolean');
	assert.equal(getProp('installationApiKey').type, 'string');
	assert.equal(getProp('productIdServiceUrl').type, 'string');
	assert.equal(getProp('productIdServiceHmacSecret').type, 'string');
});

test('FintsApi password fields have typeOptions.password set', () => {
	const creds = new FintsApi();
	const getProp = (name) => creds.properties.find((p) => p.name === name);

	assert.equal(getProp('pin').typeOptions?.password, true, 'pin should be a password field');
	assert.equal(
		getProp('installationApiKey').typeOptions?.password,
		true,
		'installationApiKey should be a password field',
	);
	assert.equal(
		getProp('productIdServiceHmacSecret').typeOptions?.password,
		true,
		'productIdServiceHmacSecret should be a password field',
	);
});

test('FintsApi useSharedProductId defaults to false', () => {
	const creds = new FintsApi();
	const prop = creds.properties.find((p) => p.name === 'useSharedProductId');
	assert.equal(prop.default, false, 'useSharedProductId should default to false');
});
