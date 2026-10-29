import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APICallError, RetryError } from 'ai';

/**
 * The decision to fall back, without a server: the error shapes of the SDK,
 * and the clocks of the attempts.
 */
const { classifyFailure, markOwnError } = await import('../src/runs/failover.ts');
const { startAttempt, failoverClassOf } = await import('../src/runs/attempt.ts');
const { UpstreamTimeout } = await import('../src/runs/streamPump.ts');

const call = (statusCode?: number, cause?: unknown) =>
	new APICallError({ message: 'x', url: 'http://u', requestBodyValues: {}, statusCode, cause });
const retried = (...errors: unknown[]) => new RetryError({ message: 'x', reason: 'maxRetriesExceeded', errors });
const socket = (code: string) => Object.assign(new Error('socket'), { code });

describe('the shapes of the errors of the SDK', () => {
	const rows: [string, unknown, string | null][] = [
		['429', call(429), 'rate_limited'],
		['500', call(500), 'upstream_error'],
		['502', call(502), 'upstream_error'],
		['503', call(503), 'upstream_error'],
		['504', call(504), 'upstream_error'],
		['retries of a 429', retried(call(429), call(429)), 'rate_limited'],
		['retries of a 503', retried(call(503)), 'upstream_error'],
		['reset, wrapped as the SDK wraps a failed fetch', call(undefined, socket('ECONNRESET')), 'unavailable'],
		['refused behind a TypeError', call(undefined, Object.assign(new TypeError('fetch failed'), { cause: socket('ECONNREFUSED') })), 'unavailable'],
		['undici socket closed', call(undefined, socket('UND_ERR_SOCKET')), 'unavailable'],
		['400', call(400), null],
		['401', call(401), null],
		['403', call(403), null],
		['404', call(404), null],
		['422', call(422), null],
		['505', call(505), null],
		['retries of a 400', retried(call(400)), null],
		['a plain error', new Error('boom'), null],
		['a socket code off the list', call(undefined, socket('ETIMEDOUT')), null],
		['an abort', Object.assign(new Error('aborted'), { name: 'AbortError' }), null],
		['nothing', undefined, null],
	];
	for (const [name, error, reason] of rows) {
		it(`C249 ${name} is ${reason ?? 'not a failover'}`, () => {
			assert.equal(classifyFailure(error)?.reason ?? null, reason);
		});
	}

	it('C249 a 503 thrown by our own code never moves the run', () => {
		const own = call(503);
		markOwnError(own);
		assert.equal(classifyFailure(own), null);
		const wrapped = retried(own);
		assert.equal(classifyFailure(wrapped), null);
	});

	it('C249 a billing 429 and a 5xx book nothing, a lost socket books the estimate', () => {
		assert.equal(classifyFailure(call(429))?.billing, 'none');
		assert.equal(classifyFailure(call(500))?.billing, 'none');
		assert.equal(classifyFailure(call(undefined, socket('ECONNRESET')))?.billing, 'estimate');
	});
});

describe('the clock of an attempt', () => {
	const run = (controller: AbortController) => ({
		signal: controller.signal,
		runId: 'r',
		userId: 'u',
		day: '2026-10-26',
		promptChars: 0,
	});
	const step = { target: {} as never, amount: 0 };

	it('C252 the timeout of one attempt aborts neither the run nor the next attempt', () => {
		const runController = new AbortController();
		const first = startAttempt(undefined as never, run(runController), step);
		const second = startAttempt(undefined as never, run(runController), step);
		first.controller.abort(new UpstreamTimeout());
		assert.equal(runController.signal.aborted, false);
		assert.equal(second.controller.signal.aborted, false);
	});

	it('C252 a cancel of the run aborts the current attempt and every later one', () => {
		const runController = new AbortController();
		const first = startAttempt(undefined as never, run(runController), step);
		runController.abort();
		const later = startAttempt(undefined as never, run(runController), step);
		assert.equal(first.controller.signal.aborted, true);
		assert.equal(later.controller.signal.aborted, true);
	});
});

describe('what the client already received', () => {
	const live = new AbortController().signal;
	const state = { hasNext: true, attempts: 1, runSignal: live, attemptSignal: live };
	const failed = (emitted: boolean) => ({ answer: '', reasoning: '', reserved: 0, error: call(503), emitted }) as never;

	// The SDK wraps a mid-stream break as a 200 APICallError, which the allowlist
	// refuses on its own; a 503 after the first frame is the case only `emitted` stops.
	it('C248 a 503 after a frame was sent never moves the run, the same 503 before it does', () => {
		assert.equal(failoverClassOf(failed(true), state), null);
		assert.equal(failoverClassOf(failed(false), state)?.reason, 'upstream_error');
	});
});
