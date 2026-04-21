import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TanRequiredError, DecoupledTanError, DecoupledTanState } from 'fints-lib';

/**
 * Inline copy of hasDecoupledTanMethod for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
function hasDecoupledTanMethod(tanMethods) {
	return tanMethods.some(
		(m) => m.decoupledMaxStatusRequests !== undefined || m.tanProcess === '2',
	);
}

/**
 * Inline copy of executeWithDecoupledTan for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function executeWithDecoupledTan(operation, retryWithDialog, client, logCallback) {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof TanRequiredError && error.isDecoupledTan()) {
			logCallback?.(
				`Decoupled TAN challenge received: "${error.challengeText}". Polling for user approval...`,
			);
			try {
				await client.handleDecoupledTanChallenge(error, (status) => {
					logCallback?.(
						`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
					);
				});
				logCallback?.('Decoupled TAN confirmed. Retrying original request...');
				const result = await retryWithDialog(error.dialog);
				return result;
			} finally {
				await error.dialog.end();
			}
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

test('executeWithDecoupledTan ends dialog even when retry fails', async () => {
	const tanError = makeDecoupledTanError();
	let dialogEndCalled = false;
	tanError.dialog.end = async () => {
		dialogEndCalled = true;
	};

	const mockClient = {
		handleDecoupledTanChallenge: async () => {},
	};

	await assert.rejects(
		() =>
			executeWithDecoupledTan(
				async () => {
					throw tanError;
				},
				async () => {
					throw new Error('retry failed');
				},
				mockClient,
			),
		/retry failed/,
	);

	assert.ok(dialogEndCalled, 'dialog.end() should be called even when retryWithDialog fails');
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
	// Not decoupled: decoupledTanState is undefined and dialog has no decoupled TAN methods

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

/**
 * Inline copy of withDecoupledTan for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function withDecoupledTan(dialog, fn, logCallback) {
	try {
		return await fn();
	} catch (error) {
		const isDecoupled =
			error instanceof TanRequiredError &&
			(error.isDecoupledTan() ||
				(error.dialog?.tanMethods?.length > 0 &&
					hasDecoupledTanMethod(error.dialog.tanMethods)));
		if (isDecoupled) {
			if (!error.isDecoupledTan()) {
				error.decoupledTanState = DecoupledTanState.INITIATED;
			}
			logCallback?.(
				`Decoupled TAN challenge (0030): "${error.challengeText}". Polling for app confirmation...`,
			);
			await dialog.handleDecoupledTan(
				error.transactionReference,
				error.challengeText,
				(status) => {
					logCallback?.(
						`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
					);
				},
			);
			logCallback?.('Decoupled TAN confirmed. Retrying request...');
			return await fn();
		}
		throw error;
	}
}

/**
 * Inline copy of initFinTs3Dialog for unit testing without needing to build.
 * Mirrors the logic in FintsNode.node.ts.
 */
async function initFinTs3Dialog(client, logCallback) {
	const dialog = client.createDialog();
	await dialog.sync();

	let initResponse;
	try {
		initResponse = await dialog.init();
	} catch (error) {
		if (error instanceof TanRequiredError) {
			const isDecoupled =
				error.isDecoupledTan() ||
				(error.dialog?.tanMethods?.length > 0 &&
					hasDecoupledTanMethod(error.dialog.tanMethods));
			if (isDecoupled) {
				if (!error.isDecoupledTan()) {
					error.decoupledTanState = DecoupledTanState.INITIATED;
				}
				logCallback?.(
					`Decoupled TAN challenge in init (0030): "${error.challengeText}". Polling for app confirmation...`,
				);
				await error.dialog.handleDecoupledTan(
					error.transactionReference,
					error.challengeText,
					(status) => {
						logCallback?.(
							`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
						);
					},
				);
				logCallback?.('Decoupled TAN confirmed. Proceeding...');
				return error.dialog;
			}
		}
		throw error;
	}

	// Sparda Bank scenario: init returned 3955 + HITAN without 0030
	const rvMap = initResponse?.returnValues?.() ?? new Map();
	const hitan = initResponse?.findSegment?.((seg) => seg?.type === 'HITAN');

	if (hitan?.transactionReference && (rvMap.has('3955') || rvMap.has('3956'))) {
		const code = rvMap.has('3956') ? '3956' : '3955';
		const challengeText = hitan.challengeText ?? '';
		logCallback?.(
			`Decoupled TAN challenge in init response (code ${code}): "${challengeText}". Polling for app confirmation...`,
		);
		await dialog.handleDecoupledTan(hitan.transactionReference, challengeText, (status) => {
			logCallback?.(
				`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
			);
		});
		logCallback?.('Decoupled TAN confirmed. Proceeding...');
	}

	return dialog;
}

// --- withDecoupledTan tests ---

test('withDecoupledTan returns result when fn succeeds', async () => {
	const dialog = { handleDecoupledTan: async () => {} };
	const result = await withDecoupledTan(dialog, async () => 'ok');
	assert.equal(result, 'ok');
});

test('withDecoupledTan re-throws non-TAN errors', async () => {
	const dialog = { handleDecoupledTan: async () => {} };
	await assert.rejects(
		() =>
			withDecoupledTan(dialog, async () => {
				throw new Error('network');
			}),
		/network/,
	);
});

test('withDecoupledTan polls and retries when fn throws decoupled TAN', async () => {
	const tanError = makeDecoupledTanError();
	const logs = [];
	let pollCalled = false;
	tanError.dialog.handleDecoupledTan = async () => {
		pollCalled = true;
	};

	let callCount = 0;
	const result = await withDecoupledTan(
		tanError.dialog,
		async () => {
			callCount++;
			if (callCount === 1) throw tanError;
			return 'retried';
		},
		(msg) => logs.push(msg),
	);

	assert.equal(result, 'retried');
	assert.ok(pollCalled, 'handleDecoupledTan should be called');
	assert.equal(callCount, 2, 'fn should be called twice');
	assert.ok(logs.some((l) => l.includes('Decoupled TAN challenge')));
	assert.ok(logs.some((l) => l.includes('Retrying request')));
});

test('withDecoupledTan re-throws non-decoupled TanRequiredError', async () => {
	const regularTanError = new TanRequiredError(
		'TAN required',
		'tx-ref',
		'Enter TAN',
		Buffer.alloc(0),
		{ end: async () => {}, tanMethods: [] },
	);
	const dialog = { handleDecoupledTan: async () => {} };

	await assert.rejects(
		() =>
			withDecoupledTan(dialog, async () => {
				throw regularTanError;
			}),
		(err) => {
			assert.strictEqual(err, regularTanError);
			return true;
		},
	);
});

// --- initFinTs3Dialog tests ---

test('initFinTs3Dialog returns dialog when init succeeds with no challenge', async () => {
	const mockDialog = {
		sync: async () => {},
		init: async () => ({ returnValues: () => new Map(), findSegment: () => null }),
		end: async () => {},
		handleDecoupledTan: async () => {},
	};
	const mockClient = { createDialog: () => mockDialog };

	const result = await initFinTs3Dialog(mockClient);
	assert.strictEqual(result, mockDialog);
});

test('initFinTs3Dialog polls when init throws decoupled TanRequiredError (0030)', async () => {
	const tanError = makeDecoupledTanError();
	let pollCalled = false;
	tanError.dialog.handleDecoupledTan = async () => {
		pollCalled = true;
	};

	const mockDialog = {
		sync: async () => {},
		init: async () => {
			throw tanError;
		},
		end: async () => {},
	};
	const mockClient = { createDialog: () => mockDialog };

	const logs = [];
	const result = await initFinTs3Dialog(mockClient, (msg) => logs.push(msg));

	assert.strictEqual(result, tanError.dialog, 'should return the dialog from the error');
	assert.ok(pollCalled, 'handleDecoupledTan should be called');
	assert.ok(logs.some((l) => l.includes('Decoupled TAN challenge in init (0030)')));
	assert.ok(logs.some((l) => l.includes('Decoupled TAN confirmed')));
});

test('initFinTs3Dialog re-throws non-decoupled TanRequiredError from init', async () => {
	const regularTanError = new TanRequiredError(
		'TAN required',
		'tx-ref',
		'Enter TAN',
		Buffer.alloc(0),
		{ end: async () => {}, tanMethods: [] },
	);

	const mockDialog = {
		sync: async () => {},
		init: async () => {
			throw regularTanError;
		},
		end: async () => {},
	};
	const mockClient = { createDialog: () => mockDialog };

	await assert.rejects(
		() => initFinTs3Dialog(mockClient),
		(err) => {
			assert.strictEqual(err, regularTanError);
			return true;
		},
	);
});

test('initFinTs3Dialog re-throws non-TAN errors from init', async () => {
	const mockDialog = {
		sync: async () => {},
		init: async () => {
			throw new Error('server down');
		},
		end: async () => {},
	};
	const mockClient = { createDialog: () => mockDialog };

	await assert.rejects(() => initFinTs3Dialog(mockClient), /server down/);
});

test('tanWaitTimeout parameter exists in node description', async () => {
	const { FintsNode } = await import('../dist/nodes/FintsNode/FintsNode.node.js');
	const node = new FintsNode();
	const param = node.description.properties.find((p) => p.name === 'tanWaitTimeout');
	assert.ok(param, 'tanWaitTimeout parameter should exist');
	assert.equal(param.type, 'number', 'should be a number parameter');
	assert.equal(param.default, 300, 'default should be 300 seconds');
});
