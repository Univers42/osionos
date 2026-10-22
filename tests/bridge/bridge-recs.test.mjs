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
 *   * the opt-out ends the request: the user is told why, and NOTHING else is
 *     read (C48 — the opt-out stops the use, not only the capture);
 *   * a champion that is not there, or a vector that cannot be computed, are
 *     answers with a reason and no item;
 *   * only the pages the caller may read are in the slate: a private page of
 *     another workspace, an archived page, the page of a blocker, the page the
 *     user refused, the caller's own page and the page they already touched
 *     are all out (C55);
 *   * the "why" names a page of the user's own ONLY while that page is still
 *     readable — and never names another user;
 *   * a broken backend is a 503 with no slate, never a half of one;
 *   * a burst is a 429.
 *
 * A strict PostgREST stub (support/recs-postgrest.mjs) answers only the
 * declared queries: a query nobody declared fails the test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifySlate } from '../../scripts/bridge-recs-model.mjs';
import { CONFIG, MODEL, callRecs, createRecsStub, uid } from './support/recs-postgrest.mjs';

/** Every test uses its own caller: the rate limit is per user, and it is shared. */
let counter = 900;
const user = () => uid(++counter);

const OTHER = uid(12);
const BLOCKER = uid(13);
const WS = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS_OTHER = 'aaaaaaaa-0000-4000-8000-000000000002';
const LIKED = uid(21);
const COMMENTED = uid(22);
const TOUCHED = uid(23);
const NEAR = uid(31);
const PRIVATE = uid(32);
const ARCHIVED = uid(33);
const BLOCKED = uid(34);
const REFUSED = uid(35);
const MINE = uid(36);

function page(id, { workspace = WS, owner = OTHER, visibility = 'shared', title = 'A page', archived = null } = {}) {
	return {
		id,
		title,
		icon: null,
		workspace_id: workspace,
		owner_id: owner,
		visibility,
		collaborators: [],
		archived_at: archived,
	};
}

/** The context of the caller: the champion, the items they touched, the one they refused. */
function context(extra = {}) {
	return {
		model: MODEL,
		user_vector: null,
		recent: [
			{ item_kind: 'page', item_id: LIKED, events: { like: 2 }, vector: [1, 0] },
			{ item_kind: 'page', item_id: COMMENTED, events: { comment: 1 }, vector: [0, 1] },
			{ item_kind: 'page', item_id: TOUCHED, events: { like: 1 }, vector: [0.2, 0.1] },
		],
		not_interested: [{ item_kind: 'page', item_id: REFUSED }],
		...extra,
	};
}

/** The nearest pages of the champion, best inner product first. */
function nearestRow(id, score) {
	return { item_kind: 'page', item_id: id, workspace_id: WS, score, vector: [1, score / 100] };
}

/** The world of the caller: nine pages, one of them each for a reason. */
function world(extra = {}, me = user()) {
	return {
		context: context(),
		nearest: [
			nearestRow(NEAR, 10),
			nearestRow(PRIVATE, 9),
			nearestRow(ARCHIVED, 8),
			nearestRow(BLOCKED, 7),
			nearestRow(REFUSED, 6),
			nearestRow(MINE, 5),
			nearestRow(TOUCHED, 4),
		],
		pages: [
			page(LIKED, { title: 'The liked page' }),
			page(COMMENTED, { title: 'The commented page' }),
			page(TOUCHED, { title: 'The touched page' }),
			page(NEAR, { title: 'The near page' }),
			page(PRIVATE, { workspace: WS_OTHER, visibility: 'private', title: 'The private page' }),
			page(ARCHIVED, { archived: '2026-01-01T00:00:00.000Z', title: 'The archived page' }),
			page(BLOCKED, { owner: BLOCKER, title: 'The blocked page' }),
			page(REFUSED, { title: 'The refused page' }),
			page(MINE, { owner: me, title: 'My own page' }),
		],
		members: [{ user_id: me, workspace_id: WS }],
		blocks: [{ blocker_id: me, blocked_id: BLOCKER }],
		...extra,
	};
}

/** The page ids of an answer. */
const pageIds = (answer) => answer.body.items.map((item) => item.pageId);

/** A world with many readable pages, each of its own author, so the limit shows. */
function wideWorld(count, me = user()) {
	const ids = Array.from({ length: count }, (_unused, index) => uid(400 + index));
	return world({
		nearest: ids.map((id, index) => nearestRow(id, 100 - index)),
		pages: ids.map((id, index) => page(id, { title: `Page ${index}`, owner: uid(500 + index) })),
	}, me);
}

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
		assert.deepEqual(stub.tables(), ['rpc/ai_rec_user_context']);
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

describe('the answer itself', () => {
	it('reads the pages in ONE query, and the blocks in one', async () => {
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
