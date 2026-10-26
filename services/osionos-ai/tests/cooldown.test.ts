import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { APICallError, RetryError } from 'ai';
import { startKit } from './failoverKit.ts';

/**
 * Which failures rest a model, for whom, and for how long (devil C256-C258).
 */
const kit = await startKit();
const { app, failing, bridge, mock, clean } = kit;
const { recordFailure, cooldownKey, retryAfterSeconds, restSeconds } = await import('../src/runs/cooldown.ts');
const { markOwnError } = await import('../src/runs/failover.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

const PLATFORM = { connectionId: 'platform', modelId: 'm', platformBudget: true };
const OWN = { connectionId: 'conn-1', modelId: 'm', platformBudget: false };

const apiError = (statusCode: number, responseHeaders?: Record<string, string>, message = 'x') =>
	new APICallError({ message, url: 'http://x', requestBodyValues: {}, statusCode, ...(responseHeaders ? { responseHeaders } : {}) });

const written = () => app.redis.keys('ai:cooldown:*');

describe('what rests a model', () => {
	const doesNotRest: [string, unknown, boolean][] = [
		['400', apiError(400), false],
		['401', apiError(401), false],
		['403', apiError(403), false],
		['404', apiError(404), false],
		['413', apiError(413), false],
		['422', apiError(422), false],
		['context length', apiError(400, undefined, 'maximum context length is 8192 tokens'), false],
		['content policy', apiError(400, undefined, 'content_policy_violation'), false],
		['an error of our own code', (() => { const own = apiError(503); markOwnError(own); return own; })(), false],
		['a plain object', { message: 'boom' }, false],
		['a cancel or our own timeout (attempt aborted)', apiError(503), true],
	];
	for (const [name, error, attemptAborted] of doesNotRest) {
		it(`C256 ${name} writes no key`, async () => {
			assert.equal(await recordFailure(app.redis, { target: OWN, userId: 'u1', error, attemptAborted }), null);
			assert.equal(await recordFailure(app.redis, { target: PLATFORM, userId: 'u1', error, attemptAborted }), null);
			assert.deepEqual(await written(), []);
		});
	}

	for (const [name, error] of [
		['429', apiError(429)],
		['503', apiError(503)],
		['a RetryError over a 500', new RetryError({ message: 'r', reason: 'maxRetriesExceeded', errors: [apiError(500)] })],
		['a reset socket', Object.assign(new Error('reset'), { code: 'ECONNRESET' })],
	] as const) {
		it(`C256 ${name} rests the model for the one user`, async () => {
			assert.equal(await recordFailure(app.redis, { target: PLATFORM, userId: 'u1', error, attemptAborted: false }), 'user');
			assert.equal((await written()).filter((key) => key.includes(':user:u1:')).length, 1);
		});
	}
});

describe('who a rest binds', () => {
	it('C257 one user, ten pathological runs: the platform model is not cooled for a second user', async () => {
		for (let run = 0; run < 10; run += 1) {
			await recordFailure(app.redis, { target: PLATFORM, userId: 'u1', error: apiError(503), attemptAborted: false });
		}
		const platformKey = cooldownKey('platform', 'platform', 'm');
		assert.equal(await app.redis.get(platformKey), null);
		assert.equal(await app.redis.get(cooldownKey('user:u2', 'platform', 'm')), null);
		assert.notEqual(await app.redis.get(cooldownKey('user:u1', 'platform', 'm')), null);
	});

	it('C257 two users, three failures in 30 s: cooled for both', async () => {
		const now = Date.now();
		const fail = (userId: string, at: number) =>
			recordFailure(app.redis, { target: PLATFORM, userId, error: apiError(503), attemptAborted: false, nowMs: at });
		assert.equal(await fail('u1', now), 'user');
		assert.equal(await fail('u1', now + 1000), 'user');
		assert.equal(await fail('u2', now + 2000), 'platform');
		assert.notEqual(await app.redis.get(cooldownKey('platform', 'platform', 'm')), null);
	});

	it('C257 three failures spread over more than 30 s do not corroborate', async () => {
		const now = Date.now();
		for (const [userId, at] of [['u1', 0], ['u2', 20_000], ['u1', 40_000]] as const) {
			await recordFailure(app.redis, { target: PLATFORM, userId, error: apiError(503), attemptAborted: false, nowMs: now + at });
		}
		assert.equal(await app.redis.get(cooldownKey('platform', 'platform', 'm')), null);
	});

	it('C257 a 429 with Retry-After cools the platform model for everyone at once', async () => {
		const scope = await recordFailure(app.redis, {
			target: PLATFORM, userId: 'u1', error: apiError(429, { 'Retry-After': '30' }), attemptAborted: false,
		});
		assert.equal(scope, 'platform');
		assert.notEqual(await app.redis.get(cooldownKey('platform', 'platform', 'm')), null);
	});

	it('C258 a connection of a user rests for its owner only', async () => {
		await recordFailure(app.redis, { target: OWN, userId: 'u1', error: apiError(429, { 'retry-after': '30' }), attemptAborted: false });
		assert.deepEqual(await written(), [cooldownKey('user:u1', 'conn-1', 'm')]);
	});
});

describe('the key and its life', () => {
	it('C258 the tuples ("a","b:c") and ("a:b","c") do not collide', () => {
		assert.notEqual(cooldownKey('platform', 'a', 'b:c'), cooldownKey('platform', 'a:b', 'c'));
		assert.notEqual(cooldownKey('user:u', 'a', 'b'), cooldownKey('platform', 'a', 'b'));
	});

	it('C258 the TTL is Retry-After capped at 300, else 60', () => {
		const now = Date.parse('2026-10-26T12:00:00Z');
		assert.equal(restSeconds(retryAfterSeconds('120', now)), 120);
		assert.equal(restSeconds(retryAfterSeconds('9999', now)), 300);
		assert.equal(restSeconds(retryAfterSeconds('Mon, 26 Oct 2026 12:01:40 GMT', now)), 100);
		for (const bad of [undefined, '', '0', '-5', '1.5', 'soon', 'Mon, 26 Oct 2026 11:00:00 GMT', '12 seconds']) {
			assert.equal(restSeconds(retryAfterSeconds(bad, now)), 60, String(bad));
		}
	});

	it('C258 every key has a TTL', async () => {
		const now = Date.now();
		const cases: [Record<string, string> | undefined, number][] = [[{ 'Retry-After': '120' }, 120_000], [{ 'retry-after': '9999' }, 300_000], [undefined, 60_000]];
		for (const [headers, ceiling] of cases) {
			await clean();
			await recordFailure(app.redis, { target: OWN, userId: 'u1', error: apiError(429, headers), attemptAborted: false, nowMs: now });
			const ttl = await app.redis.pttl(cooldownKey('user:u1', 'conn-1', 'm'));
			assert.ok(ttl > ceiling - 2000 && ttl <= ceiling, `ttl ${ttl} for ${ceiling}`);
		}
		await clean();
		for (const user of ['u1', 'u2', 'u3']) {
			await recordFailure(app.redis, { target: PLATFORM, userId: user, error: apiError(503), attemptAborted: false });
		}
		const keys = await written();
		assert.ok(keys.length >= 4, 'user keys, the tally and the platform key');
		for (const key of keys) assert.ok((await app.redis.pttl(key)) > 0, key);
	});
});
