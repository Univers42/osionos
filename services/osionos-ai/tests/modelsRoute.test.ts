import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { FREE, REASONER, startHarness, USER_A, WORKSPACE_A } from './harness.ts';

/** GET /api/ai/models: the shape of a platform item (rank, dataUse; FA14: no price, URL, key or upstream id). */
const { app, mock, base, tokenFor } = await startHarness({
	openRouterModels: [{ id: REASONER.id, rank: 3, dataUse: 'no-train' }],
});

after(async () => {
	await app.close();
	await mock.close();
});

type Item = Record<string, unknown> & { id: string };

async function listed(): Promise<Item[]> {
	const response = await fetch(`${base}/api/ai/models`, { headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}` } });
	return ((await response.json()) as { models: Item[] }).models;
}

describe('GET /api/ai/models', () => {
	it('models response keys snapshot', async () => {
		const models = await listed();
		assert.ok(models.length > 0);
		for (const item of models) {
			const keys = Object.keys(item).filter((key) => key !== 'cooldownUntil').sort();
			assert.deepEqual(keys, ['dataUse', 'default', 'id', 'label', 'rank', 'reasoning', 'vision']);
			assert.ok(!Object.keys(item).some((key) => /price|url|key|upstream/i.test(key)), `leaky key in ${item.id}`);
		}
	});

	it('shows rank and dataUse of a pool item', async () => {
		const item = (await listed()).find((m) => m.id === REASONER.id);
		assert.equal(item?.rank, 3);
		assert.equal(item?.dataUse, 'no-train');
	});

	it('shows dataUse of a legacy item, and an unranked rank as a safe integer', async () => {
		const item = (await listed()).find((m) => m.id === FREE.id);
		assert.equal(item?.dataUse, 'no-train');
		assert.ok(Number.isSafeInteger(item?.rank));
	});
});
