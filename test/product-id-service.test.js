import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

// Import the compiled service module
const {
	fetchProductIdFromService,
	maskProductId,
	PRODUCT_ID_SERVICE_TIMEOUT_MS,
	PRODUCT_ID_SERVICE_MAX_RETRIES,
	PRODUCT_ID_CACHE_TTL_DAYS,
} = await import('../dist/nodes/FintsNode/productIdService.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock IExecuteFunctions context with in-memory static data.
 */
function createMockContext(initialStaticData = {}) {
	const staticData = { global: { ...initialStaticData } };
	return {
		getWorkflowStaticData: (scope) => staticData[scope] ?? (staticData[scope] = {}),
		getNode: () => ({ name: 'FintsNode', type: 'fintsNode', typeVersion: 1, position: [0, 0], id: 'test', parameters: {} }),
		logger: { info: () => {}, warn: () => {}, error: () => {} },
	};
}

const DEFAULT_CONFIG = {
	installationApiKey: 'test-api-key',
	serviceUrl: 'https://id-service.example.com',
};

// ─── maskProductId ────────────────────────────────────────────────────────────

test('maskProductId masks all characters for short IDs', () => {
	assert.equal(maskProductId(''), '****');
	assert.equal(maskProductId('ab'), '****');
	assert.equal(maskProductId('abcd'), '****');
});

test('maskProductId shows first and last two characters for longer IDs', () => {
	const masked = maskProductId('ABCDE12345');
	assert.equal(masked, 'AB****45');
});

// ─── Cache ────────────────────────────────────────────────────────────────────

test('fetchProductIdFromService returns cached value without HTTP call when cache is valid', async () => {
	const futureExpiry = Date.now() + 24 * 60 * 60 * 1000; // 1 day from now
	const context = createMockContext({
		productRegistrationCache: {
			productRegistrationId: 'CACHED-PRODUCT-ID',
			expiresAt: futureExpiry,
		},
	});

	// Intercept the global fetch – it must NOT be called
	const fetchMock = mock.fn(() => Promise.reject(new Error('fetch should not be called')));
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		const result = await fetchProductIdFromService(context, DEFAULT_CONFIG);
		assert.equal(result, 'CACHED-PRODUCT-ID');
		assert.equal(fetchMock.mock.calls.length, 0, 'fetch should not be called when cache is valid');
	} finally {
		mock.restoreAll();
	}
});

test('fetchProductIdFromService ignores expired cache and fetches fresh value', async () => {
	const pastExpiry = Date.now() - 1000; // already expired
	const context = createMockContext({
		productRegistrationCache: {
			productRegistrationId: 'STALE-ID',
			expiresAt: pastExpiry,
		},
	});

	const freshId = 'FRESH-PRODUCT-ID';
	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ productRegistrationId: freshId }),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		const result = await fetchProductIdFromService(context, DEFAULT_CONFIG);
		assert.equal(result, freshId);
		assert.equal(fetchMock.mock.calls.length, 1, 'fetch should be called once for expired cache');
	} finally {
		mock.restoreAll();
	}
});

// ─── HTTP 200 – happy path ────────────────────────────────────────────────────

test('fetchProductIdFromService returns productRegistrationId on HTTP 200', async () => {
	const context = createMockContext();
	const expectedId = 'MY-PRODUCT-ID-001';

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ productRegistrationId: expectedId }),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		const result = await fetchProductIdFromService(context, DEFAULT_CONFIG);
		assert.equal(result, expectedId);
	} finally {
		mock.restoreAll();
	}
});

test('fetchProductIdFromService caches the result after a successful fetch', async () => {
	const context = createMockContext();
	const expectedId = 'MY-PRODUCT-ID-002';

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ productRegistrationId: expectedId }),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await fetchProductIdFromService(context, DEFAULT_CONFIG);

		// The cache must now be populated
		const staticData = context.getWorkflowStaticData('global');
		assert.ok(staticData.productRegistrationCache, 'Cache should be populated');
		assert.equal(staticData.productRegistrationCache.productRegistrationId, expectedId);
		assert.ok(
			staticData.productRegistrationCache.expiresAt > Date.now(),
			'expiresAt should be in the future',
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── HTTP 401 / 403 ──────────────────────────────────────────────────────────

test('fetchProductIdFromService throws NodeOperationError on HTTP 401', async () => {
	const context = createMockContext();

	const fetchMock = mock.fn(() =>
		Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, DEFAULT_CONFIG),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(
					err.message.includes('401'),
					'Error message should mention the status code',
				);
				assert.ok(
					err.message.toLowerCase().includes('api key') ||
						err.message.toLowerCase().includes('installationapikey'),
					'Error message should hint at the API key',
				);
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

test('fetchProductIdFromService throws NodeOperationError on HTTP 403', async () => {
	const context = createMockContext();

	const fetchMock = mock.fn(() =>
		Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, DEFAULT_CONFIG),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(err.message.includes('403'), 'Error message should mention 403');
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── Invalid JSON ─────────────────────────────────────────────────────────────

test('fetchProductIdFromService throws NodeOperationError on invalid JSON response', async () => {
	const context = createMockContext();

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.reject(new SyntaxError('Unexpected token')),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, DEFAULT_CONFIG),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(
					err.message.toLowerCase().includes('json'),
					'Error message should mention JSON',
				);
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── Missing field ────────────────────────────────────────────────────────────

test('fetchProductIdFromService throws NodeOperationError when productRegistrationId is missing from response', async () => {
	const context = createMockContext();

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ someOtherField: 'value' }),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, DEFAULT_CONFIG),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(
					err.message.toLowerCase().includes('productregistrationid'),
					'Error message should mention the missing field',
				);
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

test('fetchProductIdFromService throws NodeOperationError on request timeout', async () => {
	const context = createMockContext();

	const fetchMock = mock.fn(() => {
		const err = new Error('The operation was aborted');
		err.name = 'AbortError';
		return Promise.reject(err);
	});
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, DEFAULT_CONFIG),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(
					err.message.toLowerCase().includes('timed out') ||
						err.message.toLowerCase().includes('failed to fetch'),
					'Error message should mention timeout or failure',
				);
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

test('fetchProductIdFromService retries on network error', async () => {
	const context = createMockContext();
	const expectedId = 'RETRY-PRODUCT-ID';
	let callCount = 0;

	const fetchMock = mock.fn(() => {
		callCount++;
		if (callCount < PRODUCT_ID_SERVICE_MAX_RETRIES + 1) {
			return Promise.reject(new Error('Network error'));
		}
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ productRegistrationId: expectedId }),
		});
	});
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		const result = await fetchProductIdFromService(context, DEFAULT_CONFIG);
		assert.equal(result, expectedId);
		assert.equal(
			fetchMock.mock.calls.length,
			PRODUCT_ID_SERVICE_MAX_RETRIES + 1,
			'Should retry the correct number of times',
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── HMAC verification ────────────────────────────────────────────────────────

test('fetchProductIdFromService passes when HMAC signature is valid', async () => {
	const { createHmac } = await import('node:crypto');
	const context = createMockContext();
	const expectedId = 'HMAC-VERIFIED-ID';
	const hmacSecret = 'super-secret';
	const expiresAt = '2099-01-01T00:00:00Z';

	const payload = JSON.stringify({ productRegistrationId: expectedId, expiresAt });
	const signature = createHmac('sha256', hmacSecret).update(payload).digest('hex');

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ productRegistrationId: expectedId, expiresAt, signature }),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		const result = await fetchProductIdFromService(context, {
			...DEFAULT_CONFIG,
			hmacSecret,
		});
		assert.equal(result, expectedId);
	} finally {
		mock.restoreAll();
	}
});

test('fetchProductIdFromService throws NodeOperationError on invalid HMAC signature', async () => {
	const context = createMockContext();
	const expectedId = 'BAD-HMAC-ID';
	const hmacSecret = 'super-secret';

	const fetchMock = mock.fn(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () =>
				Promise.resolve({
					productRegistrationId: expectedId,
					signature: 'invalid-signature',
				}),
		}),
	);
	mock.method(globalThis, 'fetch', fetchMock);

	try {
		await assert.rejects(
			() => fetchProductIdFromService(context, { ...DEFAULT_CONFIG, hmacSecret }),
			(err) => {
				assert.ok(err instanceof Error, 'Should be an Error');
				assert.ok(
					err.message.toLowerCase().includes('signature'),
					'Error message should mention signature verification',
				);
				return true;
			},
		);
	} finally {
		mock.restoreAll();
	}
});

// ─── Constants ────────────────────────────────────────────────────────────────

test('Product ID service constants have expected values', () => {
	assert.equal(PRODUCT_ID_CACHE_TTL_DAYS, 7, 'Default TTL should be 7 days');
	assert.equal(PRODUCT_ID_SERVICE_TIMEOUT_MS, 5000, 'Default timeout should be 5000 ms');
	assert.equal(PRODUCT_ID_SERVICE_MAX_RETRIES, 2, 'Max retries should be 2');
});
