import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startKit } from './failoverKit.ts';
import { METERED, PLATFORM, REASONER, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import type { CatalogEntry, PlatformCatalog } from '../src/gateway/catalog.ts';

/**
 * The Auto chain (FA11, FA12, FA23): which models a run with no usable model
 * falls through, and who may be a fallback.
 */
const kit = await startKit({
	openRouterModels: [
		{ ...METERED, rank: 1, dataUse: 'no-train' },
		{ ...VISION, rank: 2, dataUse: 'no-train' },
		{ ...PLATFORM, rank: 3, dataUse: 'no-train' },
		{ ...REASONER, rank: 4, dataUse: 'may-train' },
	],
});
const { app, failing, bridge, mock, runToEnd, post, clean, tokenFor, createConversation } = kit;
const { autoChain } = await import('../src/runs/auto.ts');
const { cooldownKey } = await import('../src/runs/cooldown.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

const entry = (menuId: string, providerId: string, rank: number, dataUse: 'no-train' | 'may-train' = 'no-train'): CatalogEntry => ({
	menuId, upstreamId: menuId, providerId, wire: 'openrouter', dataUse, rank,
	pricing: { id: menuId, label: menuId, inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: false },
});
const catalogOf = (...entries: CatalogEntry[]): PlatformCatalog => ({ entries, providers: [], defaultId: entries[0]?.menuId ?? '' });
const ids = (chain: CatalogEntry[]): string[] => chain.map((one) => one.menuId);
const never = () => false;

describe('autoChain', () => {
	it('openrouter-only Auto gives 3 (FA12)', () => {
		const catalog = catalogOf(entry('d', 'or', 4), entry('b', 'or', 2), entry('a', 'or', 1), entry('c', 'or', 3));
		assert.deepEqual(ids(autoChain(catalog, never)), ['a', 'b', 'c']);
	});

	it('other providers first', () => {
		const catalog = catalogOf(entry('a1', 'a', 1), entry('a2', 'a', 2), entry('b5', 'b', 5), entry('c7', 'c', 7));
		assert.deepEqual(ids(autoChain(catalog, never)), ['a1', 'b5', 'c7']);
		assert.deepEqual(ids(autoChain(catalogOf(entry('a1', 'a', 1), entry('a2', 'a', 2), entry('b5', 'b', 5)), never)), ['a1', 'b5', 'a2']);
	});

	it('never picks may-train (FA23)', () => {
		const catalog = catalogOf(entry('mt', 'a', 1, 'may-train'), entry('ok', 'a', 2), entry('mt2', 'b', 3, 'may-train'));
		assert.deepEqual(ids(autoChain(catalog, never)), ['ok']);
	});

	it('resting entries skipped, and all resting is empty', () => {
		const catalog = catalogOf(entry('a', 'a', 1), entry('b', 'a', 2), entry('c', 'a', 3));
		assert.deepEqual(ids(autoChain(catalog, (id) => id === 'a')), ['b', 'c']);
		assert.deepEqual(autoChain(catalog, () => true), []);
	});

	it('a tie goes to the catalog default, not the first listed (R13)', () => {
		const unranked = (id: string) => entry(id, 'legacy', Number.MAX_SAFE_INTEGER);
		const catalog = { ...catalogOf(unranked('x'), unranked('y'), unranked('d')), defaultId: 'd' };
		assert.deepEqual(ids(autoChain(catalog, never)), ['d', 'x', 'y']);
	});

	it('unranked entries sort last, in list order', () => {
		const unranked = (id: string) => entry(id, 'a', Number.MAX_SAFE_INTEGER);
		assert.deepEqual(ids(autoChain(catalogOf(unranked('x'), unranked('y'), entry('r', 'a', 9)), never)), ['r', 'x', 'y']);
	});
});

describe('Auto on the run route', () => {
	before(clean);

	it('a run with no model tries the best, another provider, then the next rank; never may-train', async () => {
		await clean();
		failing.always('mock-metered', 503);
		failing.always('mock-vision', 503);
		failing.always('mock-platform', 503);
		failing.always('mock-reasoner', 503);
		failing.always('mock-model', 503);
		await runToEnd({});
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-model', 'mock-vision']);
	});

	it('unknown model id falls back to auto', async () => {
		await clean();
		await runToEnd({ model: 'no-such-model' });
		assert.deepEqual(failing.requests, ['mock-metered']);
		await clean();
		await runToEnd({ model: 'auto' });
		assert.deepEqual(failing.requests, ['mock-metered']);
	});

	it('a resting model is skipped by Auto', async () => {
		await clean();
		failing.script('mock-metered', 503);
		await runToEnd({});
		failing.requests.length = 0;
		await runToEnd({});
		assert.equal(failing.countFor('mock-metered'), 0);
		assert.equal(failing.countFor('mock-vision'), 1);
	});

	it('explicit user fallbacks win over Auto (FA11)', async () => {
		await clean();
		failing.always('mock-model', 503);
		await runToEnd({ fallbacks: [{ model: 'mock-platform' }] });
		assert.deepEqual(failing.requests, ['mock-model', 'mock-platform']);
	});

	it('may-train fallback -> 400 fallback_may_train', async () => {
		await clean();
		const conversationId = await createConversation();
		const response = await post({
			runId: crypto.randomUUID(), conversationId, text: 'hi', model: 'mock-model', fallbacks: [{ model: 'mock-reasoner' }],
		}, tokenFor(USER_A, WORKSPACE_A));
		assert.equal(response.status, 400);
		assert.equal(((await response.json()) as { code: string }).code, 'fallback_may_train');
		assert.deepEqual(failing.requests, []);
	});

	it('an Auto run reads the rests once, like a run with a model', async () => {
		await clean();
		const calls: number[] = [];
		const original = app.redis.mget.bind(app.redis);
		(app.redis as { mget: unknown }).mget = (...args: unknown[]) => { calls.push(1); return (original as (...a: unknown[]) => unknown)(...args); };
		try {
			await runToEnd({});
			const auto = calls.length;
			calls.length = 0;
			await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
			assert.equal(auto, calls.length);
			assert.equal(auto, 1);
		} finally {
			(app.redis as { mget: unknown }).mget = original;
		}
	});

	it('an empty chain (every entry resting) answers as before', async () => {
		await clean();
		const until = String(Date.now() + 60_000);
		// Every no-train entry of the harness catalog; a may-train one is never in the chain.
		for (const id of ['mock-metered', 'mock-vision', 'mock-platform', 'mock-model', 'mock-dear', 'mock/first:free', 'mock/second:free']) {
			await app.redis.set(cooldownKey(`user:${USER_A}`, 'platform', id), until, 'EX', 60);
		}
		await runToEnd({});
		assert.deepEqual(failing.requests, ['mock-model']);
		const conversationId = await createConversation();
		const response = await post({ runId: crypto.randomUUID(), conversationId, text: 'hi', model: 'no-such-model' }, tokenFor(USER_A, WORKSPACE_A));
		assert.equal(response.status, 400);
		assert.equal(((await response.json()) as { code: string }).code, 'model_not_allowed');
		await clean();
	});
});
