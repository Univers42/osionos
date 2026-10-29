/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs.test.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "For you" on the bridge: the user's slate of pages.
 *
 * What the route must hold:
 *   * the flag off answers the 404 of a route that does not exist, and reads
 *     nothing at all;
 *   * the opt-out reads no personal data: the user is told why, and only the
 *     popular order is read (C48; bridge-recs-popular.test.mjs);
 *   * a champion that is not there, or a vector that cannot be computed, are
 *     answers with a reason and no item;
 *   * only the pages the caller may read are in the slate: a private page of
 *     another workspace, an archived page, the page of a blocker, the page the
 *     user refused, the caller's own page and the page they already touched
 *     are all out (C55);
 *   * the "why" names a page of the user's own ONLY while that page is still
 *     readable — and never names another user;
 *   * the answer itself (one read per table, the limit, the signature, a 503,
 *     a 429) is bridge-recs-answer.test.mjs.
 *
 * A strict PostgREST stub (support/recs-postgrest.mjs) answers only the
 * declared queries: a query nobody declared fails the test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, callRecs, createRecsStub } from './support/recs-postgrest.mjs';
import {
	user,
	OTHER,
	BLOCKER,
	LIKED,
	TOUCHED,
	NEAR,
	PRIVATE,
	ARCHIVED,
	BLOCKED,
	REFUSED,
	MINE,
	page,
	context,
	world,
	pageIds,
} from './support/recs-world.mjs';

describe('GET /api/recs/for-you', () => {
	it('answers the 404 of a route that does not exist when the flag is off', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me, env: {} });
		assert.equal(answer.status, 404);
		assert.equal(answer.body.ok, false);
		assert.deepEqual(stub.calls, []);
	});

	it('answers 401 when there is no token at all', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me, token: null });
		assert.equal(answer.status, 401);
		assert.equal(answer.body.ok, false);
		assert.deepEqual(stub.calls, []);
	});

	it('answers the 404, not a 401, to a caller without a token when the flag is off', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me, token: null, env: {} });
		assert.equal(answer.status, 404);
		assert.deepEqual(stub.calls, []);
	});

	it('leaves the routes it does not own to someone else', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me, path: '/api/recs/other' });
		assert.equal(answer.handled, false);
		assert.deepEqual(stub.calls, []);
	});
});

describe('the opt-out, the champion and the vector', () => {
	it('stops at the opt-out, and reads nothing else', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: { opted_out: true } }, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, personalized: false, reason: 'opted_out', items: [] });
		assert.deepEqual(stub.tables(), ['rpc/ai_rec_user_context', 'rpc/ai_rec_popular']);
	});

	it('answers no_model when there is no champion', async () => {
		const me = user();
		const stub = createRecsStub(world({ context: { model: null } }, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.personalized, false);
		assert.equal(answer.body.reason, 'no_model');
		assert.deepEqual(answer.body.items, []);
	});

	it('answers cold_start when no vector can be computed at all', async () => {
		const me = user();
		const stub = createRecsStub(world({
			context: context({ model: { ...MODEL, item_gram: null, event_weights: null }, user_vector: null, recent: [] }),
		}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.personalized, false);
		assert.equal(answer.body.reason, 'cold_start');
		assert.deepEqual(answer.body.items, []);
	});

	it('uses the vector the champion stored when the fold-in cannot run', async () => {
		const me = user();
		const stored = [0.5, 0.25];
		const stub = createRecsStub(world({
			context: context({ model: { ...MODEL, item_gram: null, event_weights: null }, user_vector: stored }),
		}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.body.personalized, true);
		assert.equal(stub.calls[1].body.p_vector.length, 2);
		assert.deepEqual(stub.calls[1].body.p_vector, stored);
	});
});

describe('what the slate may hold', () => {
	it('holds the readable page, and only that one', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.personalized, true);
		assert.deepEqual(pageIds(answer), [NEAR]);
		assert.equal(answer.body.items[0].rank, 1);
		assert.equal(answer.body.items[0].title, 'The near page');
	});

	it('leaves out the private page of another workspace', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(PRIVATE));
	});

	it('leaves out the archived page', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(ARCHIVED));
	});

	it('leaves out the page of somebody the caller blocked', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(BLOCKED));
	});

	it('leaves out the page the user refused', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(REFUSED));
	});

	it('leaves out the page of the caller', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(MINE));
	});

	it('leaves out the page the user already touched', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.ok(!pageIds(answer).includes(TOUCHED));
	});
});

describe('the why, and the names in the answer', () => {
	it('names the page the user liked, while that page is readable', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		assert.deepEqual(answer.body.items[0].why, {
			kind: 'because',
			pageId: LIKED,
			title: 'The liked page',
			event: 'liked',
		});
	});

	it('names nothing once that page went private', async () => {
		const me = user();
		const pages = world({}, me).pages.map((row) => (row.id === LIKED ? { ...row, visibility: 'private' } : row));
		const stub = createRecsStub(world({ pages }, me));
		const answer = await callRecs(stub, { userId: me });
		assert.deepEqual(answer.body.items[0].why, { kind: 'for_you' });
	});

	it('never names another user', async () => {
		const me = user();
		const stub = createRecsStub(world({}, me));
		const answer = await callRecs(stub, { userId: me });
		const text = JSON.stringify(answer.body);
		assert.ok(!text.includes(OTHER), 'the owner of a page is never in the answer');
		assert.ok(!text.includes(BLOCKER), 'a blocked user is never in the answer');
	});
});
