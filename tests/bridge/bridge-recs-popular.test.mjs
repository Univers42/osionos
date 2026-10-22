/**
 * "For you" when it cannot personalise (devil C48): the popular order.
 *
 * What the route must hold:
 *   * opted_out, no_model and cold_start all serve ai_rec_popular instead of an
 *     empty strip, flagged personalized:false with the reason;
 *   * an opted-out request reads NO personal data: no nearest, no settings, no
 *     log — only the flag, the popular rows and the page checks;
 *   * the popular pages pass the same ACL / blocks / own-page rule as the
 *     personal slate (C55), and the pages the user refused are dropped;
 *   * the slate is signed, and the refusal route accepts it;
 *   * a database without ai_rec_popular answers the old empty shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifySlate } from '../../scripts/bridge-recs-slate.mjs';
import { CONFIG, callRecs, createRecsStub } from './support/recs-postgrest.mjs';
import {
	ARCHIVED, BLOCKED, MINE, NEAR, PRIVATE, REFUSED, TOUCHED,
	context, pageIds, user, world, wideWorld,
} from './support/recs-world.mjs';

const row = (id, users) => ({ item_id: id, users });
const OPTED_OUT = { opted_out: true };
const NO_MODEL = { model: null };
const POPULAR = [row(NEAR, 9), row(PRIVATE, 8), row(ARCHIVED, 7), row(BLOCKED, 6), row(MINE, 5), row(TOUCHED, 4)];

describe('the popular order when "For you" cannot personalise', () => {
	it('serves the readable popular pages to an opted-out user, in rank order, and reads nothing personal', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: OPTED_OUT, popular: POPULAR }, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.personalized, false);
		assert.equal(answer.body.reason, 'opted_out');
		assert.deepEqual(pageIds(answer), [NEAR, TOUCHED]);
		assert.deepEqual(answer.body.items.map((item) => item.rank), [1, 2]);
		assert.ok(answer.body.items.every((item) => item.why.kind === 'popular'));
		assert.deepEqual(stub.tables(), [
			'rpc/ai_rec_user_context',
			'rpc/ai_rec_popular',
			'osionos_pages',
			'osionos_workspace_members',
			'osionos_user_blocks',
		]);
		const asked = stub.calls.find((call) => call.table === 'rpc/ai_rec_popular');
		assert.deepEqual(Object.keys(asked.body), ['p_limit']);
	});

	it('drops the pages the user refused for no_model and cold_start', async () => {
		for (const [reason, ctx] of [
			['no_model', { model: null, not_interested: [{ item_kind: 'page', item_id: NEAR }] }],
			['cold_start', context({ user_vector: null, recent: [], model: { ...context().model, item_gram: null, event_weights: null }, not_interested: [{ item_kind: 'page', item_id: NEAR }] })],
		]) {
			const me = user();
			const popular = [row(NEAR, 9), row(REFUSED, 8), row(TOUCHED, 4)];
			const stub = createRecsStub(world({ context: ctx, popular }, me));
			const answer = await callRecs(stub, { userId: me });
			assert.equal(answer.body.reason, reason);
			assert.equal(answer.body.personalized, false);
			assert.deepEqual(pageIds(answer), [REFUSED, TOUCHED], reason);
		}
	});

	it('never serves a page the viewer cannot read, a blocked owner or their own page', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: NO_MODEL, popular: POPULAR.slice(0, 5) }, me));
		const answer = await callRecs(stub, { userId: me });
		assert.deepEqual(pageIds(answer), [NEAR]);
	});

	it('clamps the limit and keeps the popular rank', async () => {
		const me = user();
		const w = wideWorld(25, me);
		const popular = w.nearest.map((entry, index) => row(entry.item_id, 100 - index));
		const stub = createRecsStub({ ...w, context: NO_MODEL, popular }, me);
		const answer = await callRecs(stub, { userId: me, query: '?limit=3' });
		assert.deepEqual(pageIds(answer), w.nearest.slice(0, 3).map((entry) => entry.item_id));
	});

	it('signs the slate for the caller, and the refusal route accepts it', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: NO_MODEL, popular: [row(NEAR, 9)] }, me));
		const answer = await callRecs(stub, { userId: me });
		const verified = verifySlate(CONFIG.appSessionSecret, answer.body.slate, me, Date.now());
		assert.equal(verified.recId, answer.body.recId);
		assert.deepEqual(verified.items, [NEAR]);
		const refused = await callRecs(stub, {
			userId: me, method: 'POST', path: '/api/recs/not-interested', body: { slate: answer.body.slate, pageId: NEAR },
		});
		assert.deepEqual(refused.body, { ok: true, recorded: true });
	});

	it('answers the old empty shape when the database has no ai_rec_popular', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: OPTED_OUT, popular: POPULAR }, me), { missing: ['popular'] });
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, personalized: false, reason: 'opted_out', items: [] });
		assert.deepEqual(stub.tables(), ['rpc/ai_rec_user_context', 'rpc/ai_rec_popular']);
	});

	it('answers a 503 when the popular read fails for another reason', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: NO_MODEL, popular: POPULAR }, me), { failing: ['popular'] });
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 503);
	});
});
