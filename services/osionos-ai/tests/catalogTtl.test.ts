import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import { catalogFixture, startCatalogServer } from './catalogFixture.ts';

/**
 * AB34: the in-memory copy of the catalog lives CATALOG_TTL_SECONDS seconds,
 * not that many milliseconds. The clock is injected (node:test's mock Date),
 * so the test does not wait a day.
 */
const catalogServer = await startCatalogServer(catalogFixture('http://127.0.0.1:1'));
process.env.OSIONOS_AI_CATALOG_URL = catalogServer.url;
const { catalog, CATALOG_TTL_SECONDS } = await import('../src/connections/catalog.ts');

const TTL_MS = CATALOG_TTL_SECONDS * 1000;
const SHARED = JSON.stringify([{ id: 'shared', name: 'Shared', npm: '@ai-sdk/openai-compatible', models: {} }]);

/** A Redis that counts its reads; `shared` is what the other replica wrote. */
function fakeRedis(shared: string | null) {
	const calls = { get: 0, set: 0 };
	const redis = {
		get: async () => { calls.get += 1; return shared; },
		set: async () => { calls.set += 1; return 'OK'; },
	};
	return { calls, redis: redis as unknown as Parameters<typeof catalog>[0] };
}

before(() => mock.timers.enable({ apis: ['Date'], now: 0 }));
afterEach(() => mock.timers.tick(2 * TTL_MS));
after(async () => {
	mock.timers.reset();
	await catalogServer.close();
});

describe('the in-memory copy of the catalog', () => {
	it('a copy taken from Redis is still served after the old 86 s, and renewed after a day', async () => {
		const { calls, redis } = fakeRedis(SHARED);
		await catalog(redis);
		mock.timers.tick(3_600_000);
		await catalog(redis);
		assert.equal(calls.get, 1, 'one hour later the copy in memory is served');
		mock.timers.tick(TTL_MS);
		await catalog(redis);
		assert.equal(calls.get, 2, 'past the day the copy is read again');
	});

	it('a copy fetched from the URL is kept for a day too', async () => {
		const { calls, redis } = fakeRedis(null);
		const found = await catalog(redis);
		assert.ok(found.length > 0);
		assert.equal(calls.set, 1);
		mock.timers.tick(3_600_000);
		await catalog(redis);
		assert.equal(calls.get, 1, 'one hour later the copy in memory is served');
		mock.timers.tick(TTL_MS);
		await catalog(redis);
		assert.equal(calls.get, 2, 'past the day the copy is renewed');
	});
});
