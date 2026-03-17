import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TanRequiredError, DecoupledTanError, DecoupledTanState } from 'fints-lib/dist/index.js';

/**
 * Inline copy of executeWithDecoupledTan for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function executeWithDecoupledTan(operation, retryWithDialog, client, logCallback) {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof TanRequiredError && error.isDecoupledTan()) {
			logCallback?.(`Decoupled TAN challenge received: "${error.challengeText}". Polling for user approval...`);
			await client.handleDecoupledTanChallenge(error, (status) => {
				logCallback?.(`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`);
			});
			logCallback?.('Decoupled TAN confirmed. Retrying original request...');
			const result = await retryWithDialog(error.dialog);
			await error.dialog.end();
			return result;
		}
		throw error;
	}
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

test('executeWithDecoupledTan returns result when operation succeeds', async () => {
	const result = await executeWithDecoupledTan(
		async () => ['account1', 'account2'],
		async () => [],
		{},
	);
	assert.deepEqual(result, ['account1', 'account2']);
});

test('executeWithDecoupledTan re-throws non-TAN errors', async () => {
	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async () => {
					throw new Error('network failure');
				},
				async () => [],
				{},
			),
		/network failure/,
	);
});

test('executeWithDecoupledTan handles decoupled TAN and retries with dialog', async () => {
	const tanError = makeDecoupledTanError();
	const logs = [];
	let dialogEndCalled = false;
	tanError.dialog.end = async () => {
		dialogEndCalled = true;
	};

	const mockClient = {
		handleDecoupledTanChallenge: async () => {},
	};

	let operationCallCount = 0;
	const result = await executeWithDecoupledTan(
		async () => {
			operationCallCount++;
			throw tanError;
		},
		async (dialog) => {
			assert.strictEqual(dialog, tanError.dialog, 'retry should receive the error dialog');
			return ['retried-account'];
		},
		mockClient,
		(msg) => logs.push(msg),
	);

	assert.deepEqual(result, ['retried-account']);
	assert.equal(operationCallCount, 1, 'operation should be called once');
	assert.ok(dialogEndCalled, 'dialog.end() should be called after retry');
	assert.ok(
		logs.some((l) => l.includes('Decoupled TAN challenge received')),
		'should log challenge received',
	);
	assert.ok(
		logs.some((l) => l.includes('Retrying original request')),
		'should log retry',
	);
});

test('executeWithDecoupledTan propagates DecoupledTanError from polling', async () => {
	const tanError = makeDecoupledTanError();

	const mockStatus = {
		state: DecoupledTanState.TIMED_OUT,
		transactionReference: 'tx-ref-123',
		statusRequestCount: 10,
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
		() =>
			executeWithDecoupledTan(
				async () => {
					throw tanError;
				},
				async () => [],
				mockClient,
			),
		(err) => {
			assert.strictEqual(err, decoupledError, 'should propagate the original DecoupledTanError');
			return true;
		},
	);
});

test('executeWithDecoupledTan re-throws non-decoupled TanRequiredError', async () => {
	const mockDialog = { end: async () => {} };
	const regularTanError = new TanRequiredError(
		'TAN required',
		'tx-ref-456',
		'Enter your TAN',
		Buffer.alloc(0),
		mockDialog,
	);
	// Not decoupled: decoupledTanState is undefined

	const mockClient = {
		handleDecoupledTanChallenge: async () => {},
	};

	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async () => {
					throw regularTanError;
				},
				async () => [],
				mockClient,
			),
		(err) => {
			assert.strictEqual(err, regularTanError, 'should re-throw the original TanRequiredError');
			return true;
		},
	);
});
