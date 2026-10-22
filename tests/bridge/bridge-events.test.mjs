/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-events.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The beacon of "For you": the impressions and the clicks the client reports,
 * written for the recommender's click-through to be measured (C48, C49).
 *
 * What the route must hold:
 *   * the flag off answers the 404 of a route that does not exist, before the
 *     session — a caller without a token cannot tell a disabled beacon from a
 *     missing one;
 *   * the CONSENT comes first: a user who did not say yes gets a 204 and
 *     nothing else is read or written, and a body that claims `consent: true`
 *     changes nothing (the consent lives in the row, never in the request);
 *   * the event is written for the SESSION user, with the rec_id and the rank
 *     of the SIGNED SLATE — never a rank the body names;
 *   * a page that was not in the slate, a page the user may not read and a
 *     ghost uuid are all DROPPED, not errors;
 *   * the slate of another user is refused, a batch of 51 events is refused,
 *     a body of 17 KB is refused, and the burst is a 429 with Retry-After;
 *   * the database's refusals are answers: 22023 a 400, 54000 a 429, and
 *     anything else a 503.
 *
 * A strict PostgREST stub (support/events-postgrest.mjs) answers only the
 * declared queries: a query nobody declared fails the test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signSlate } from '../../scripts/bridge-recs-slate.mjs';
import { CONFIG, callEvents, createEventsStub, uid } from './support/events-postgrest.mjs';
import { OTHER, WS, WS_OTHER, page, user } from './support/recs-world.mjs';

const REC_ID = '11111111-1111-4111-8111-111111111111';
const SHOWN = uid(31);
const HIDDEN = uid(32);
const ELSEWHERE = uid(33);
const GHOST = uid(34);

/** The world of the caller: one readable page, one private one, one elsewhere. */
function world(extra = {}, me = user()) {
	return {
		settings: [{ user_id: me, beacon_consent: true }],
		pages: [
			page(SHOWN, { title: 'The page of the slate' }),
			page(HIDDEN, { workspace: WS_OTHER, visibility: 'private', title: 'The private page' }),
			page(ELSEWHERE, { title: 'The page of another slate' }),
		],
		members: [{ user_id: me, workspace_id: WS }],
		blocks: [],
		...extra,
	};
}

/** A slate signed for one user, holding the pages given. */
function slate(items, userId, { issuedAt = Date.now(), recId = REC_ID } = {}) {
	return signSlate(CONFIG.appSessionSecret, { recId, userId, surface: 'home', items, issuedAt });
}

/** The events of a batch, as the client sends them. */
const events = (...pages) => pages.map((pageId) => ({ event: 'impression', pageId }));

describe('the beacon of "For you"', () => {
	it('writes ONE call, for the SESSION user, with the rec_id and the ranks of the slate', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN, ELSEWHERE], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: {
				slate: token,
				// A rank in the body is IGNORED: the rank is the slate's.
				events: [
					{ event: 'impression', pageId: SHOWN, rank: 99 },
					{ event: 'click', pageId: ELSEWHERE, rank: 99 },
				],
				userId: OTHER,
				ts: 1,
			},
		});
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, written: 2 });
		assert.equal(stub.rpcs().length, 1);
		assert.deepEqual(stub.rpcs()[0].body, {
			p_user: me,
			p_events: [
				{ item_id: SHOWN, workspace_id: WS, event: 'impression', surface: 'home', rec_id: REC_ID, rank: 1 },
				{ item_id: ELSEWHERE, workspace_id: WS, event: 'click', surface: 'home', rec_id: REC_ID, rank: 2 },
			],
		});
	});

	it('reads the consent, the pages, the memberships and the blocks in that order', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		await callEvents(stub, { userId: me, body: { slate: token, events: events(SHOWN) } });
		assert.deepEqual(stub.tables(), [
			'ai_personalization_settings',
			'osionos_pages',
			'osionos_workspace_members',
			'osionos_user_blocks',
			'rpc/ai_events_beacon',
		]);
	});

	it('drops a page that was not in the slate', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN, ELSEWHERE) },
		});
		assert.equal(answer.status, 200);
		assert.equal(stub.rpcs().length, 1);
		assert.deepEqual(stub.rpcs()[0].body.p_events.map((event) => event.item_id), [SHOWN]);
	});

	it('drops a page the user may not read', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN, HIDDEN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN, HIDDEN) },
		});
		assert.equal(answer.status, 200);
		assert.equal(stub.rpcs().length, 1);
		assert.deepEqual(stub.rpcs()[0].body.p_events.map((event) => event.item_id), [SHOWN]);
	});

	it('drops a ghost uuid, and writes nothing at all', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(GHOST) },
		});
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, written: 0 });
		assert.deepEqual(stub.rpcs(), []);
	});

	it('refuses the slate of another user', async () => {
		const me = user();
		const other = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], other);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 400);
		assert.deepEqual(answer.body, { ok: false, code: 'invalid_slate' });
		assert.deepEqual(stub.rpcs(), []);
	});
});

describe('the consent comes first (C48)', () => {
	it('answers 204 and reads NOTHING else when the user has no row', async () => {
		const me = user();
		const stub = createEventsStub(world({ settings: [] }, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 204);
		assert.equal(answer.text, '');
		assert.deepEqual(stub.tables(), ['ai_personalization_settings']);
		assert.deepEqual(stub.rpcs(), []);
	});

	it('ignores a body that claims the consent (the consent lives in the row)', async () => {
		const me = user();
		const stub = createEventsStub(world({ settings: [] }, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN), consent: true },
		});
		assert.equal(answer.status, 204);
		assert.deepEqual(stub.rpcs(), []);
	});

	it('answers 503 when the consent read fails', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me), { failing: ['consent'] });
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 503);
		assert.deepEqual(stub.rpcs(), []);
	});
});

describe('the route, the flag and the burst', () => {
	it('answers the 404 of a route that does not exist when the flag is off', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			env: {},
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 404);
		assert.deepEqual(stub.calls, []);
	});

	it('answers the 404 BEFORE the session: a caller without a token cannot tell a disabled beacon from a missing one', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			token: null,
			env: {},
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 404);
		assert.deepEqual(stub.calls, []);
	});

	it('answers 405 to a GET', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const answer = await callEvents(stub, { method: 'GET', userId: me });
		assert.equal(answer.status, 405);
		assert.equal(answer.body.ok, false);
	});

	it('refuses a batch of 51 events', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(...Array.from({ length: 51 }, () => SHOWN)) },
		});
		assert.equal(answer.status, 400);
		assert.deepEqual(stub.rpcs(), []);
	});

	it('refuses a body of 17 KB', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			raw: JSON.stringify({ slate: token, events: events(SHOWN), pad: 'x'.repeat(17_000) }),
		});
		assert.equal(answer.status, 413);
		assert.deepEqual(stub.rpcs(), []);
	});

	it('answers 429 with Retry-After over the bucket', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me));
		const token = slate([SHOWN], me);
		const statuses = [];
		let last = null;
		for (let call = 0; call < 21; call += 1) {
			last = await callEvents(stub, {
				userId: me,
				body: { slate: token, events: events(SHOWN) },
			});
			statuses.push(last.status);
		}
		assert.deepEqual(statuses, [...Array(20).fill(200), 429]);
		assert.equal(last.body.ok, false);
		assert.ok(Number(last.headers['retry-after']) >= 1, 'the answer says when to come back');
	});
});

describe('the database refuses, and the bridge answers', () => {
	it('answers 400 when the database refuses the batch (22023)', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me), { rpcCode: '22023' });
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 400);
		assert.equal(answer.body.ok, false);
	});

	it('answers 429 when the daily cap is reached (54000)', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me), { rpcCode: '54000' });
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 429);
		assert.equal(answer.body.ok, false);
	});

	it('answers 503 when the write fails, and never a beacon the user believes was written', async () => {
		const me = user();
		const stub = createEventsStub(world({}, me), { failing: ['beacon'] });
		const token = slate([SHOWN], me);
		const answer = await callEvents(stub, {
			userId: me,
			body: { slate: token, events: events(SHOWN) },
		});
		assert.equal(answer.status, 503);
		assert.deepEqual(answer.body, { ok: false });
	});
});
