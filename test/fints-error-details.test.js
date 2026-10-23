import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIRMG, HIRMS, ResponseError } from 'fints-lib';
import { formatFinTSError } from '../dist/nodes/FintsNode/FintsNode.node.js';

function returnValues(...codes) {
	return new Map(codes.map(([code, message]) => [code, { code, message }]));
}

test('formatFinTSError includes all HIRMG and HIRMS return codes', () => {
	const segments = new Map([
		[HIRMG, [{ returnValues: returnValues(['9050', 'Message signature error']) }]],
		[
			HIRMS,
			[
				{ returnValues: returnValues(['9260', 'Challenge request aborted']) },
				{
					returnValues: returnValues(
						['3070', 'Invalid challenge request'],
						['3999', 'Insufficient permission'],
					),
				},
			],
		],
	]);
	const response = {
		returnValues: () => returnValues(['9050', 'Message signature error']),
		findSegments: (segmentType) => segments.get(segmentType) ?? [],
	};
	const error = new ResponseError(response);

	const message = formatFinTSError(error);

	assert.match(message, /\[9050\] Message signature error/);
	assert.match(message, /\[9260\] Challenge request aborted/);
	assert.match(message, /\[3070\] Invalid challenge request/);
	assert.match(message, /\[3999\] Insufficient permission/);
});
