/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-answer.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 13:50:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:50:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "For you" on the bridge: the answer itself.
 *
 * What the answer must hold:
 *   * one read per table, and the page ids in queries of at most 100 — 400 ids
 *     in one `in.()` is a ~15 KB request line, past the 8 KB an nginx in front
 *     of PostgREST accepts by default;
 *   * the limit is clamped into 1..20;
 *   * the slate is signed for the caller, the pages in rank order;
 *   * a broken backend is a 503 with no slate, never a half of one;
 *   * a burst is a 429.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifySlate } from '../../scripts/bridge-recs-slate.mjs';
import { CONFIG, callRecs, createRecsStub, idsOf } from './support/recs-postgrest.mjs';
import {
	user,
	NEAR,
	world,
	wideWorld,
} from './support/recs-world.mjs';

describe('the answer itself', () => {
	it('reads the pages of a small slate in ONE query, and the blocks in one', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		await callRecs(stub, { userId: me });
		assert.deepEqual(stub.tables(), [
			'rpc/ai_rec_user_context',
			'rpc/ai_rec_nearest',
			'osionos_pages',
			'osionos_workspace_members',
			'osionos_user_blocks',
		]);
	});

	it('reads the pages of a wide slate in queries of at most 100 ids', async () => {
		const me = user();
		const stub = createRecsStub(wideWorld(250, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		const pageQueries = stub.calls.filter((call) => call.table === 'osionos_pages');
		const sizes = pageQueries.map((call) => idsOf(new URLSearchParams(call.query).get('id')).length);
		assert.deepEqual(sizes.toSorted((left, right) => right - left), [100, 100, 53]);
		assert.ok(pageQueries.every((call) => call.query.length < 8192), 'every request line fits 8 KB');
		const asked = new Set(pageQueries.flatMap((call) => idsOf(new URLSearchParams(call.query).get('id'))));
		assert.equal(asked.size, 253);
		assert.equal(answer.body.items.length, 10);
	});

	it('clamps the limit into 1..20', async () => {
		const me = user();
		const wide = await callRecs(createRecsStub(wideWorld(25, me)), { userId: me, query: '?limit=99' });
		assert.equal(wide.body.items.length, 20);
		const plain = await callRecs(createRecsStub(wideWorld(25, me)), { userId: me, query: '?limit=nonsense' });
		assert.equal(plain.body.items.length, 10);
		const one = await callRecs(createRecsStub(wideWorld(25, me)), { userId: me, query: '?limit=0' });
		assert.equal(one.body.items.length, 1);
	});

	it('signs the slate for the caller and the pages in rank order', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		const verified = verifySlate(CONFIG.appSessionSecret, answer.body.slate, me, Date.now());
		assert.equal(verified.recId, answer.body.recId);
		assert.equal(verified.surface, 'home');
		assert.deepEqual(verified.items, [NEAR]);
	});

	it('answers a 503 and no slate when the backend fails', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me), { failing: ['nearest'] });
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 503);
		assert.equal(answer.body.ok, false);
		assert.equal(answer.body.items, undefined);
	});

	it('answers a 429 on the twenty-first call of a burst', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answers = [];
		for (let call = 0; call < 21; call += 1) {
			answers.push(await callRecs(stub, { userId: me }));
		}
		assert.deepEqual(answers.map((answer) => answer.status), [...Array(20).fill(200), 429]);
		assert.equal(answers[20].body.ok, false);
	});
});
