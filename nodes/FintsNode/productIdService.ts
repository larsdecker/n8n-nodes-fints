import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createHmac } from 'node:crypto';

/** Default TTL for the cached product registration ID (7 days). */
export const PRODUCT_ID_CACHE_TTL_DAYS = 7;

/** Default timeout in milliseconds for a single HTTP request to the product ID service. */
export const PRODUCT_ID_SERVICE_TIMEOUT_MS = 5_000;

/** Number of additional attempts after the initial request fails. */
export const PRODUCT_ID_SERVICE_MAX_RETRIES = 2;

export interface ProductIdServiceConfig {
	installationApiKey: string;
	serviceUrl: string;
	hmacSecret?: string;
}

interface ProductIdCache {
	productRegistrationId: string;
	expiresAt: number;
}

interface ProductIdServiceResponse {
	productRegistrationId: string;
	expiresAt?: string;
	signature?: string;
}

interface WorkflowStaticData {
	productRegistrationCache?: ProductIdCache;
}

/**
 * Returns a masked version of the product ID for safe logging
 * (shows only the first two and last two characters).
 */
export function maskProductId(id: string): string {
	if (id.length <= 4) {
		return '****';
	}
	return `${id.substring(0, 2)}****${id.substring(id.length - 2)}`;
}

/**
 * Returns the cached product registration ID if it is still valid, or null otherwise.
 */
function getCachedProductId(context: IExecuteFunctions): string | null {
	const staticData = context.getWorkflowStaticData('global') as WorkflowStaticData;
	const cache = staticData.productRegistrationCache;
	if (cache && typeof cache.productRegistrationId === 'string' && Date.now() < cache.expiresAt) {
		return cache.productRegistrationId;
	}
	return null;
}

/**
 * Stores the product registration ID in the workflow static data cache.
 */
function setCachedProductId(
	context: IExecuteFunctions,
	productId: string,
	ttlDays: number = PRODUCT_ID_CACHE_TTL_DAYS,
): void {
	const staticData = context.getWorkflowStaticData('global') as WorkflowStaticData;
	staticData.productRegistrationCache = {
		productRegistrationId: productId,
		expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
	};
}

/**
 * Performs a fetch request with an abort-based timeout.
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetches the product registration ID from the central ID service.
 *
 * Priority within this function:
 * 1. Cached value (not expired)
 * 2. HTTP POST to the service endpoint
 *
 * Retries up to PRODUCT_ID_SERVICE_MAX_RETRIES times with exponential back-off.
 * Throws a NodeOperationError for HTTP 401/403 (invalid API key), invalid JSON,
 * missing fields, HMAC verification failures, and timeouts.
 */
export async function fetchProductIdFromService(
	context: IExecuteFunctions,
	config: ProductIdServiceConfig,
): Promise<string> {
	const cached = getCachedProductId(context);
	if (cached) {
		context.logger.info(
			`Using cached product registration ID (masked: ${maskProductId(cached)})`,
		);
		return cached;
	}

	const { installationApiKey, serviceUrl, hmacSecret } = config;
	const endpoint = `${serviceUrl.replace(/\/$/, '')}/v1/getProductId`;

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= PRODUCT_ID_SERVICE_MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			// Exponential back-off: 1 s, 2 s, …
			await new Promise<void>((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
		}

		try {
			const response = await fetchWithTimeout(
				endpoint,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${installationApiKey}`,
					},
					body: JSON.stringify({}),
				},
				PRODUCT_ID_SERVICE_TIMEOUT_MS,
			);

			if (response.status === 401 || response.status === 403) {
				throw new NodeOperationError(
					context.getNode(),
					`Product ID service returned HTTP ${response.status}: invalid API key. ` +
						'Please verify the installationApiKey in your credentials.',
				);
			}

			if (!response.ok) {
				throw new Error(`Product ID service returned HTTP ${response.status}`);
			}

			let data: ProductIdServiceResponse;
			try {
				data = (await response.json()) as ProductIdServiceResponse;
			} catch {
				throw new NodeOperationError(
					context.getNode(),
					'Product ID service returned an invalid JSON response.',
				);
			}

			if (!data.productRegistrationId || typeof data.productRegistrationId !== 'string') {
				throw new NodeOperationError(
					context.getNode(),
					'Product ID service response is missing the productRegistrationId field.',
				);
			}

			// Optional HMAC signature verification
			const effectiveHmacSecret =
				hmacSecret || (process.env.FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET ?? '').trim();
			if (effectiveHmacSecret && data.signature) {
				const payload = JSON.stringify({
					productRegistrationId: data.productRegistrationId,
					expiresAt: data.expiresAt,
				});
				const expectedSignature = createHmac('sha256', effectiveHmacSecret)
					.update(payload)
					.digest('hex');
				if (data.signature !== expectedSignature) {
					throw new NodeOperationError(
						context.getNode(),
						'Product ID service response signature verification failed.',
					);
				}
			}

			setCachedProductId(context, data.productRegistrationId);
			context.logger.info(
				`Fetched product registration ID from service (masked: ${maskProductId(data.productRegistrationId)})`,
			);
			return data.productRegistrationId;
		} catch (error) {
			if (error instanceof NodeOperationError) {
				// These errors are definitive – do not retry.
				throw error;
			}
			if (error instanceof Error && error.name === 'AbortError') {
				lastError = new Error(
					`Product ID service request timed out after ${PRODUCT_ID_SERVICE_TIMEOUT_MS} ms`,
				);
			} else {
				lastError = error instanceof Error ? error : new Error(String(error));
			}
		}
	}

	throw new NodeOperationError(
		context.getNode(),
		`Failed to fetch product ID from service after ${PRODUCT_ID_SERVICE_MAX_RETRIES + 1} attempt(s): ${lastError?.message ?? 'unknown error'}`,
	);
}
