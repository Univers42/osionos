import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APICallError, RetryError, StreamProviderError } from 'ai';

/**
 * The closed class of a provider failure, without a server: the error shapes
 * of the SDK go in, a code and what the row keeps come out.
 *
 * The OpenRouter and llama.cpp bodies below are UNVERIFIED fixtures: they are
 * the shapes the docs and the diagnosis describe, not captures of a live reply.
 */
const { classifyRunFailure, classifyUpstreamError, errorFrame, storedError } = await import('../src/runs/upstreamError.ts');
const { markOwnError } = await import('../src/runs/failover.ts');

const NOW = Date.parse('2026-11-01T12:00:00Z');
const CANARY = 'sk-or-v1-CANARY account acme@example.com';

const body = (message: string, metadata?: Record<string, unknown>) =>
	JSON.stringify({ error: { code: 429, message, ...(metadata ? { metadata } : {}) } });
const call = (statusCode?: number, options: { message?: string; responseBody?: string; retryAfter?: string; cause?: unknown } = {}) =>
	new APICallError({
		message: options.message ?? 'x',
		url: 'http://u',
		requestBodyValues: {},
		statusCode,
		cause: options.cause,
		responseBody: options.responseBody,
		responseHeaders: options.retryAfter ? { 'Retry-After': options.retryAfter } : {},
	});
const inStream = (statusCode?: number, message = 'x') => new StreamProviderError({ message, statusCode });
const retried = (...errors: unknown[]) => new RetryError({ message: 'x', reason: 'maxRetriesExceeded', errors });
const socket = (code: string) => Object.assign(new Error('socket'), { code });
const classify = (error: unknown) => classifyUpstreamError(error, NOW);

describe('the class of a provider failure', () => {
	const rows: [string, unknown, string][] = [
		['429', call(429), 'rate_limited'],
		['the retries of a 429', retried(call(429), call(429)), 'rate_limited'],
		['402', call(402), 'quota_exhausted'],
		['a 429 that names the daily cap', call(429, { message: 'Rate limit exceeded: free-models-per-day' }), 'quota_exhausted'],
		['a 402 that names a minute still reads as a 402', call(402, { message: 'per-min' }), 'quota_exhausted'],
		['500', call(500), 'provider_unavailable'],
		['503', call(503), 'provider_unavailable'],
		['529', call(529), 'provider_unavailable'],
		['a reset socket', call(undefined, { cause: socket('ECONNRESET') }), 'provider_unavailable'],
		['a 400 naming the context length', call(400, { message: "This model's maximum context length is 8192 tokens" }), 'context_too_long'],
		['a 400 with the code in its body', call(400, { responseBody: JSON.stringify({ error: { code: 'context_length_exceeded', message: 'no' } }) }), 'context_too_long'],
		['llama.cpp over its window', call(400, { responseBody: JSON.stringify({ error: { type: 'exceed_context_size_error', message: 'no' } }) }), 'context_too_long'],
		['any other 400', call(400, { message: 'bad tool schema' }), 'upstream_error'],
		['401', call(401), 'upstream_error'],
		['404', call(404), 'upstream_error'],
		['a plain error', new Error('boom'), 'upstream_error'],
		['a string', 'boom', 'upstream_error'],
		['nothing', undefined, 'upstream_error'],
		['a 200 stream error with a 503', inStream(503), 'provider_unavailable'],
		['a 200 stream error with a 429', inStream(429), 'rate_limited'],
		['a 200 stream error with no status', inStream(undefined, 'odd'), 'upstream_error'],
		['a plain object that looks like one', { message: 'busy', code: 503 }, 'upstream_error'],
	];
	for (const [name, error, code] of rows) {
		it(`${name} is ${code}`, () => assert.equal(classify(error).code, code));
	}

	it('our own 503 is never blamed on the provider, however deep it is wrapped', () => {
		const own = call(503);
		markOwnError(own);
		assert.deepEqual(classify(own), { code: 'upstream_error' });
		assert.deepEqual(classify(retried(own)), { code: 'upstream_error' });
	});

	it('a status outside 100-599 in a stream error is no status', () => {
		for (const status of [99, 600, 42.5]) {
			assert.deepEqual(classify(inStream(status)), { code: 'upstream_error' }, String(status));
		}
	});

	it('an Error with a code is ours to judge, not a stream error (pg SQLSTATE, a socket)', () => {
		assert.deepEqual(classify(Object.assign(new Error('x'), { code: 503 })), { code: 'upstream_error' });
	});

	it('only the provider text inside the bound is read', () => {
		const late = `${'a'.repeat(5000)} free-models-per-day`;
		assert.equal(classify(call(429, { message: late })).code, 'rate_limited');
		const longBody = JSON.stringify({ error: { message: 'a'.repeat(5000), metadata: { error_type: 'throttled' } } });
		assert.equal(classify(call(429, { responseBody: longBody })).errorType, undefined);
	});

	it('a hostile 4 KiB of provider text costs no backtracking', () => {
		const started = performance.now();
		for (const text of ['per-'.repeat(1000), 'context '.repeat(700), 'maximum '.repeat(700)]) classify(call(429, { message: text }));
		assert.ok(performance.now() - started < 50);
	});
});

describe('the seconds of a rate limit', () => {
	it('keeps a Retry-After in seconds', () => {
		assert.equal(classify(call(429, { retryAfter: '12' })).retryAfterSeconds, 12);
	});

	it('reads an HTTP date against the clock it is given', () => {
		assert.equal(classify(call(429, { retryAfter: 'Sun, 01 Nov 2026 12:00:30 GMT' })).retryAfterSeconds, 30);
	});

	it('caps a long wait at five minutes', () => {
		assert.equal(classify(call(429, { retryAfter: '86400' })).retryAfterSeconds, 300);
	});

	it('drops a wait that is zero, past or unreadable', () => {
		for (const retryAfter of ['0', '-1', 'soon', 'Sun, 01 Nov 2026 11:00:00 GMT']) {
			assert.equal('retryAfterSeconds' in errorFrame(classify(call(429, { retryAfter }))), false, retryAfter);
		}
	});

	it('belongs to a rate limit only', () => {
		assert.equal(classify(call(503, { retryAfter: '12' })).retryAfterSeconds, undefined);
		assert.equal(classify(call(402, { retryAfter: '12' })).retryAfterSeconds, undefined);
	});
});

describe('what the row keeps', () => {
	it('keeps the code, the status and the type of the provider', () => {
		const error = call(429, { responseBody: body('busy', { error_type: 'provider_overloaded' }) });
		assert.equal(storedError(classify(error)), 'rate_limited:429:provider_overloaded');
	});

	it('drops what it does not have', () => {
		assert.equal(storedError(classify(call(503))), 'provider_unavailable:503');
		assert.equal(storedError(classify(new Error('boom'))), 'upstream_error');
	});

	it('keeps a type only when it is a plain word', () => {
		for (const type of [CANARY, 'a:b', 'a'.repeat(65), 'x\ny', 7, null, {}]) {
			const error = call(429, { responseBody: body('busy', { error_type: type }) });
			assert.equal(storedError(classify(error)), 'rate_limited:429', String(type));
		}
	});

	it('survives a body that is not JSON', () => {
		assert.equal(storedError(classify(call(429, { responseBody: '<html>429</html>' }))), 'rate_limited:429');
		assert.equal(storedError(classify(call(429, { responseBody: 'null' }))), 'rate_limited:429');
	});

	it('never writes the bare key the re-POST of a run is refused by', () => {
		for (const error of [call(429), inStream(429), retried(call(429))]) {
			assert.notEqual(storedError(classify(error)), 'rate_limited');
		}
	});
});

describe('what the browser gets', () => {
	it('is the code and the seconds, and nothing else', () => {
		assert.deepEqual(errorFrame(classify(call(429, { retryAfter: '12' }))), { code: 'rate_limited', retryAfterSeconds: 12 });
		assert.deepEqual(errorFrame(classify(call(503))), { code: 'provider_unavailable' });
	});

	it('never carries the words, headers, url or request of the provider', () => {
		const metadata = { provider_name: CANARY, raw: CANARY, error_type: CANARY };
		const errors = [429, 402, 400, 500, 401].map((status) =>
			new APICallError({
				message: CANARY,
				url: `http://u/${CANARY}`,
				requestBodyValues: { key: CANARY },
				statusCode: status,
				responseBody: body(CANARY, metadata),
				responseHeaders: { 'x-account': CANARY, 'retry-after': '5' },
			}),
		);
		for (const error of [...errors, new StreamProviderError({ message: CANARY, type: CANARY, code: CANARY, statusCode: 503 })]) {
			const failure = classify(error);
			assert.ok(!JSON.stringify(errorFrame(failure)).includes('CANARY'));
			assert.ok(!storedError(failure).includes('CANARY'));
		}
	});
});

describe('whose failure it is', () => {
	const pgDown = socket('ECONNREFUSED');

	it('classifies the error of the attempt', () => {
		const failure = call(429);
		assert.equal(classifyRunFailure(failure, failure).code, 'rate_limited');
	});

	it('our database refusing a connection is not the provider being down', () => {
		assert.deepEqual(classifyRunFailure(pgDown, undefined), { code: 'upstream_error' });
	});

	it('a later failure of ours does not take the class of an attempt that was replaced', () => {
		assert.deepEqual(classifyRunFailure(pgDown, call(429)), { code: 'upstream_error' });
	});
});
