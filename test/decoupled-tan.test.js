import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TanRequiredError, DecoupledTanError, DecoupledTanState } from 'fints-lib';

/**
 * Inline copy of executeWithDecoupledTan for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function executeWithDecoupledTan(operation, logCallback) {
	try {
		return { result: await operation() };
	} catch (error) {
		if (error instanceof TanRequiredError && error.isDecoupledTan()) {
			const dialog = error.dialog;
			logCallback?.(
				`Decoupled TAN challenge received: "${error.challengeText}". Polling for user approval...`,
			);
			await dialog.handleDecoupledTan(error.transactionReference, error.challengeText, (status) => {
				logCallback?.(
					`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
				);
			});
			logCallback?.('Decoupled TAN confirmed. Retrying original request...');
			return { result: await operation(dialog), dialog };
		}
		throw error;
	}
}

function makeDecoupledTanError() {
	const mockDialog = {
		end: async () => {},
		handleDecoupledTan: async () => {},
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
	const result = await executeWithDecoupledTan(async () => ['account1', 'account2']);
	assert.deepEqual(result.result, ['account1', 'account2']);
});

test('executeWithDecoupledTan re-throws non-TAN errors', async () => {
	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async () => {
					throw new Error('network failure');
				},
			),
		/network failure/,
	);
});

test('executeWithDecoupledTan handles decoupled TAN and retries with dialog', async () => {
	const tanError = makeDecoupledTanError();
	const logs = [];
	let handleDecoupledTanCalled = false;
	tanError.dialog.handleDecoupledTan = async () => {
		handleDecoupledTanCalled = true;
	};

	let operationCallCount = 0;
	const result = await executeWithDecoupledTan(
		async (dialog) => {
			operationCallCount++;
			if (!dialog) {
				throw tanError;
			}
			assert.strictEqual(dialog, tanError.dialog, 'retry should receive the error dialog');
			return ['retried-account'];
		},
		(msg) => logs.push(msg),
	);

	assert.deepEqual(result.result, ['retried-account']);
	assert.strictEqual(result.dialog, tanError.dialog, 'should expose the reused dialog');
	assert.equal(operationCallCount, 1, 'operation should be called once');
	assert.ok(handleDecoupledTanCalled, 'dialog.handleDecoupledTan() should be called');
	assert.ok(
		logs.some((l) => l.includes('Decoupled TAN challenge received')),
		'should log challenge received',
	);
	assert.ok(
		logs.some((l) => l.includes('Retrying original request')),
		'should log retry',
	);
});

test('executeWithDecoupledTan propagates retry errors', async () => {
	const tanError = makeDecoupledTanError();
	tanError.dialog.handleDecoupledTan = async () => {};

	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async (dialog) => {
					if (!dialog) {
						throw tanError;
					}
					throw new Error('retry failed');
				},
			),
		/retry failed/,
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

	tanError.dialog.handleDecoupledTan = async () => {
		throw decoupledError;
	};

	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async (dialog) => {
					if (!dialog) {
						throw tanError;
					}
					return [];
				},
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

	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async () => {
					throw regularTanError;
				},
			),
		(err) => {
			assert.strictEqual(err, regularTanError, 'should re-throw the original TanRequiredError');
			return true;
		},
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
