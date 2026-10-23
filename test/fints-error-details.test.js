import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResponseError } from 'fints-lib';
import { formatFinTSError } from '../dist/nodes/FintsNode/FintsNode.node.js';

test('formatFinTSError includes warning and error return codes from FinTS responses', () => {
	const error = new ResponseError({
		returnValues: () =>
			new Map([
				['9050', { code: '9050', message: 'Message signature error' }],
				['9260', { code: '9260', message: 'Challenge request aborted' }],
				['3070', { code: '3070', message: 'Invalid challenge request' }],
				['3999', { code: '3999', message: 'Insufficient permission' }],
			]),
	});

	const message = formatFinTSError(error);

	assert.match(message, /\[9050\] Message signature error/);
	assert.match(message, /\[9260\] Challenge request aborted/);
	assert.match(message, /\[3070\] Invalid challenge request/);
	assert.match(message, /\[3999\] Insufficient permission/);
});
