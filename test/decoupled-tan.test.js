import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TanRequiredError, DecoupledTanError, DecoupledTanState } from 'fints-lib';

/**
 * Minimal inline implementation of waitForDecoupledTan for unit testing.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function waitForDecoupledTan(client, error, logCallback) {
	logCallback(
		`Decoupled TAN challenge received: "${error.challengeText}". Waiting for app confirmation...`,
	);
	await client.handleDecoupledTanChallenge(error, (status) => {
		logCallback(`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`);
	});
	logCallback('Decoupled TAN confirmed by user.');
	return error.dialog;
}

function makeDecoupledTanError() {
	const mockDialog = {
		end: async () => {},
	};
	const error = new TanRequiredError(
		'TAN required',
		'tx-ref-123',
		'Please confirm in your banking app',
		Buffer.alloc(0),
		mockDialog,
	);
	error.decoupledTanState = DecoupledTanState.INITIATED;
	return error;
}

test('waitForDecoupledTan returns error.dialog on success', async () => {
	const tanError = makeDecoupledTanError();
	const logs = [];

	const mockClient = {
		handleDecoupledTanChallenge: async () => {},
	};

	const dialog = await waitForDecoupledTan(mockClient, tanError, (msg) => logs.push(msg));

	assert.strictEqual(dialog, tanError.dialog, 'should return the dialog from the error');
	assert.ok(
		logs.some((l) => l.includes('Decoupled TAN challenge received')),
		'should log challenge received',
	);
	assert.ok(
		logs.some((l) => l.includes('confirmed by user')),
		'should log confirmation',
	);
});

test('waitForDecoupledTan propagates DecoupledTanError from polling (timeout)', async () => {
	const tanError = makeDecoupledTanError();

	const mockStatus = {
		state: DecoupledTanState.TIMED_OUT,
		transactionReference: 'tx-ref-123',
		statusRequestCount: 60,
		maxStatusRequests: 60,
		startTime: new Date(),
		errorMessage: 'Total timeout exceeded',
	};

	const decoupledError = new DecoupledTanError('Timed out', mockStatus);

	const mockClient = {
		handleDecoupledTanChallenge: async () => {
			throw decoupledError;
		},
	};

	await assert.rejects(
		() => waitForDecoupledTan(mockClient, tanError, () => {}),
		(err) => {
			assert.strictEqual(err, decoupledError, 'should propagate the original DecoupledTanError');
			return true;
		},
	);
});

test('isDecoupledTan() returns false for regular (non-decoupled) TanRequiredError', () => {
	const mockDialog = { end: async () => {} };
	const regularTanError = new TanRequiredError(
		'TAN required',
		'tx-ref-456',
		'Enter your TAN',
		Buffer.alloc(0),
		mockDialog,
	);
	// decoupledTanState is undefined — not a decoupled challenge
	assert.equal(
		regularTanError.isDecoupledTan(),
		false,
		'should not be decoupled when decoupledTanState is undefined',
	);
});

test('isDecoupledTan() returns true when decoupledTanState is set', () => {
	const tanError = makeDecoupledTanError();
	assert.equal(
		tanError.isDecoupledTan(),
		true,
		'should be decoupled when decoupledTanState is set',
	);
});

test('tanWaitTimeout parameter exists in node description', async () => {
	const { FintsNode } = await import('../dist/nodes/FintsNode/FintsNode.node.js');
	const node = new FintsNode();
	const param = node.description.properties.find((p) => p.name === 'tanWaitTimeout');
	assert.ok(param, 'tanWaitTimeout parameter should exist');
	assert.equal(param.type, 'number', 'should be a number parameter');
	assert.equal(param.default, 300, 'default should be 300 seconds');
});
