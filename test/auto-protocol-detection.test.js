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

/**
 * Inline copy of the resolveFinTSClient control-flow logic for unit testing.
 * Mirrors the inner arrow function in FintsNode.node.ts execute().
 * The real implementation closes over addDebugLog/logger; here we accept them as params
 * so tests can assert on logged messages.
 */
async function resolveFinTSClient(
protocol,
config,
{ capabilities, createV4Client, createV3Client, addDebugLog = () => {} } = {},
) {
if (protocol === 'auto') {
addDebugLog('Protocol set to Auto: probing for FinTS 4.1 support...');
const v4ProbeClient = createV4Client(config);
try {
await capabilities(v4ProbeClient);
addDebugLog('Auto-detect: FinTS 4.1 is supported, using 4.1');
return { client: v4ProbeClient, resolvedProtocol: '4.1' };
} catch (probeError) {
if (probeError instanceof PinError || probeError instanceof AuthenticationError) {
throw probeError;
}
const probeReason = probeError instanceof Error ? probeError.message : String(probeError);
addDebugLog(
`Auto-detect: FinTS 4.1 probe failed (${probeReason}), falling back to FinTS 3.0`,
);
return { client: createV3Client(config), resolvedProtocol: '3.0' };
}
}
return {
resolvedProtocol: protocol,
client: protocol === '4.1' ? createV4Client(config) : createV3Client(config),
};
}

// ── control-flow tests for resolveFinTSClient ────────────────────────────────

test('resolveFinTSClient: auto → returns 4.1 when capabilities() succeeds', async () => {
const v4Client = { type: 'v4' };
const v3Client = { type: 'v3' };
const logs = [];

const { client, resolvedProtocol } = await resolveFinTSClient('auto', {}, {
capabilities: async () => {},
createV4Client: () => v4Client,
createV3Client: () => v3Client,
addDebugLog: (m) => logs.push(m),
});

assert.strictEqual(resolvedProtocol, '4.1', 'should resolve to 4.1');
assert.strictEqual(client, v4Client, 'should reuse the probe client');
assert.ok(
logs.some((l) => l.includes('FinTS 4.1 is supported')),
'should log 4.1 success',
);
});

test('resolveFinTSClient: auto → falls back to 3.0 on protocol-level probe failure', async () => {
const v3Client = { type: 'v3' };
const logs = [];

const { client, resolvedProtocol } = await resolveFinTSClient('auto', {}, {
capabilities: async () => {
throw new Error('connection refused');
},
createV4Client: () => ({ type: 'v4' }),
createV3Client: () => v3Client,
addDebugLog: (m) => logs.push(m),
});

assert.strictEqual(resolvedProtocol, '3.0', 'should fall back to 3.0');
assert.strictEqual(client, v3Client, 'should use the v3 client');
assert.ok(
logs.some((l) => l.includes('connection refused')),
'should include probe error reason in log',
);
});

test('resolveFinTSClient: auto → re-throws PinError without falling back to 3.0', async () => {
const pinError = new PinError('wrong pin', '9340');

await assert.rejects(
() =>
resolveFinTSClient('auto', {}, {
capabilities: async () => {
throw pinError;
},
createV4Client: () => ({ type: 'v4' }),
createV3Client: () => ({ type: 'v3' }),
}),
(err) => {
assert.strictEqual(err, pinError, 'exact PinError instance should propagate');
return true;
},
);
});

test('resolveFinTSClient: auto → re-throws AuthenticationError without falling back to 3.0', async () => {
const authError = new AuthenticationError('account locked', '9900');

await assert.rejects(
() =>
resolveFinTSClient('auto', {}, {
capabilities: async () => {
throw authError;
},
createV4Client: () => ({ type: 'v4' }),
createV3Client: () => ({ type: 'v3' }),
}),
(err) => {
assert.strictEqual(err, authError, 'exact AuthenticationError instance should propagate');
return true;
},
);
});

test('resolveFinTSClient: fixed 3.0 → uses v3 client without any probe', async () => {
let capabilitiesCalled = false;
const v3Client = { type: 'v3' };

const { client, resolvedProtocol } = await resolveFinTSClient('3.0', {}, {
capabilities: async () => {
capabilitiesCalled = true;
},
createV4Client: () => ({ type: 'v4' }),
createV3Client: () => v3Client,
});

assert.strictEqual(resolvedProtocol, '3.0');
assert.strictEqual(client, v3Client);
assert.ok(!capabilitiesCalled, 'capabilities() should not be called in fixed-3.0 mode');
});

test('resolveFinTSClient: fixed 4.1 → uses v4 client without fallback probe', async () => {
let capabilitiesCalled = false;
const v4Client = { type: 'v4' };

const { client, resolvedProtocol } = await resolveFinTSClient('4.1', {}, {
capabilities: async () => {
capabilitiesCalled = true;
},
createV4Client: () => v4Client,
createV3Client: () => ({ type: 'v3' }),
});

assert.strictEqual(resolvedProtocol, '4.1');
assert.strictEqual(client, v4Client);
assert.ok(!capabilitiesCalled, 'capabilities() should not be called in fixed-4.1 mode');
});
