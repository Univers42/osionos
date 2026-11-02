import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { APICallError } from 'ai';
import { FREE_TIER_FIRST, USER_A, USER_B } from './harness.ts';
import { startKit } from './failoverKit.ts';

/**
 * What closes the shared free quota, and for how long (devil, AI-ERR-2).
 */
const kit = await startKit();
const { app, failing, bridge, mock, clean, createConversation } = kit;
const { recordFailure, accountRestSeconds, resetSeconds } = await import('../src/runs/cooldown.ts');
const { quotaSignal, spendsSharedQuota } = await import('../src/runs/quota.ts');
const { classifyUpstreamError } = await import('../src/runs/upstreamError.ts');
const { startRun } = await import('../src/runs/runner.ts');
const { resolveTarget } = await import('../src/gateway/resolve.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

const ACCOUNT_KEY = 'ai:cooldown:account:platform';
const FREE = { connectionId: 'platform', modelId: 'a/b:free', platformBudget: true };
const apiError = (statusCode: number, responseHeaders: Record<string, string> = {}, responseBody?: string) =>
	new APICallError({ message: 'x', url: 'http://x', requestBodyValues: {}, statusCode, responseHeaders, ...(responseBody ? { responseBody } : {}) });
const named = JSON.stringify({ error: { metadata: { provider_name: 'P', raw: 'r' } } });
const typed = JSON.stringify({ error: { metadata: { error_type: 'rate_limit_exceeded' } } });
const failFor = (error: unknown, userId: string = USER_A, target = FREE) =>
	recordFailure(app.redis, { target, userId, error, attemptAborted: false });
const accountEnds = async () => Number((await app.redis.get(ACCOUNT_KEY)) ?? 0);

describe('which routes spend the shared quota', () => {
	for (const [modelId, platformBudget, expected] of [
		['a/b:free', true, true],
		['openrouter/free', true, true],
		['a/b', true, false],
		['qwen3-4b', true, false],
		['a/b:free', false, false],
	] as const) {
		it(`${modelId}, platform ${platformBudget}: ${expected}`, () => {
			assert.equal(spendsSharedQuota({ modelId, platformBudget }), expected);
		});
	}
});

describe('whose limit a failure is', () => {
	const rows: [string, unknown, string | null][] = [
		['a platform limit, by its headers', apiError(429, { 'X-RateLimit-Limit': '20' }), 'account'],
		['the headers win over a named provider', apiError(429, { 'x-ratelimit-reset': '1' }, named), 'account'],
		['no credit', apiError(402), 'account'],
		['the type, with no provider', apiError(429, {}, typed), 'account'],
		['a named provider', apiError(429, {}, named), 'provider'],
		['a provider code', apiError(429, {}, JSON.stringify({ error: { metadata: { provider_code: 429, error_type: 'rate_limit_exceeded' } } })), 'provider'],
		['nothing said', apiError(429), 'ambiguous'],
		['a body that does not parse', apiError(429, {}, '<html>'), 'ambiguous'],
		['a body too long to read, naming a provider', apiError(429, {}, JSON.stringify({ error: { metadata: { provider_name: 'P', raw: 'x'.repeat(5000) } } })), 'ambiguous'],
		['a 503', apiError(503), null],
	];
	for (const [name, error, expected] of rows) {
		it(name, () => assert.equal(quotaSignal(error)?.kind ?? null, expected));
	}
});

describe('what rests the account', () => {
	it('a 402 does, though it moves no run', async () => {
		assert.equal(await failFor(apiError(402)), 'account');
		assert.ok((await accountEnds()) > Date.now());
	});

	it('a route off the shared quota never does', async () => {
		await failFor(apiError(429, { 'x-ratelimit-limit': '20' }), USER_A, { ...FREE, modelId: 'a/b' });
		assert.equal(await accountEnds(), 0);
	});

	it("a user's own connection never does, whatever its upstream says", async () => {
		await failFor(apiError(429, { 'x-ratelimit-limit': '20' }, typed), USER_A, { connectionId: 'c', modelId: 'a/b:free', platformBudget: false });
		assert.equal(await accountEnds(), 0);
	});

	it('an aborted attempt never does', async () => {
		await recordFailure(app.redis, { target: FREE, userId: USER_A, error: apiError(402), attemptAborted: true });
		assert.equal(await accountEnds(), 0);
	});

	it('an ambiguous 429 needs three failures from two users', async () => {
		await failFor(apiError(429));
		await failFor(apiError(429));
		await failFor(apiError(429));
		assert.equal(await accountEnds(), 0, 'one user alone');
		assert.equal(await failFor(apiError(429), USER_B), 'account');
		assert.ok((await accountEnds()) > Date.now());
	});

	it('a shorter rest never shortens a longer one', async () => {
		await failFor(apiError(429, { 'x-ratelimit-limit': '20', 'retry-after': '120' }));
		const longer = await accountEnds();
		await failFor(apiError(429, { 'x-ratelimit-limit': '20', 'retry-after': '5' }));
		assert.equal(await accountEnds(), longer);
	});

	it('writers at once keep the longest', async () => {
		await Promise.all([5, 200, 30, 90].map((seconds) => failFor(apiError(429, { 'x-ratelimit-limit': '20', 'retry-after': String(seconds) }))));
		assert.ok(((await accountRestSeconds(app.redis)) ?? 0) > 100);
	});

	it('a reset fourteen hours away rests 300 s, and the frame promises nothing', async () => {
		const error = apiError(429, { 'x-ratelimit-limit': '50', 'x-ratelimit-reset': String(Date.now() + 14 * 3_600_000) });
		await failFor(error);
		const seconds = await accountRestSeconds(app.redis);
		assert.ok(seconds !== undefined && seconds <= 300 && seconds > 290);
		const failure = classifyUpstreamError(error);
		assert.equal(failure.code, 'quota_exhausted');
		assert.equal(failure.retryAfterSeconds, undefined);
	});

	it('a near reset is the seconds of the frame', () => {
		const failure = classifyUpstreamError(apiError(429, { 'x-ratelimit-reset': String(Date.now() + 9_000) }));
		assert.equal(failure.code, 'rate_limited');
		assert.ok(failure.retryAfterSeconds !== undefined && failure.retryAfterSeconds <= 9 && failure.retryAfterSeconds >= 8);
	});

	it('a reset that is not a future epoch in milliseconds says nothing', () => {
		for (const value of ['1', '60', 'soon', '', String(Math.floor(Date.now() / 1000))]) {
			assert.equal(resetSeconds(value, Date.now()), undefined, value);
		}
	});

	it('no rest reads as no seconds', async () => {
		assert.equal(await accountRestSeconds(app.redis), undefined);
	});
});
