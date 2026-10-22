/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-not-interested.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "Not interested" on the bridge: the user refuses a page of the slate they
 * were shown, and the next slate honours it.
 *
 * What the route must hold:
 *   * the flag off answers the 404 of a route that does not exist, and reads
 *     nothing at all;
 *   * a valid slate and a page of it write ONE row, with the rank the page
 *     held in that slate, and for the SESSION's user whatever the body says;
 *   * the slate of ANOTHER user is refused, and so is a tampered one and one
 *     older than an hour (C49 — a refusal proves nothing on its own);
 *   * a page that is not in the slate is refused: a user may refuse only what
 *     we showed THEM;
 *   * the opt-out writes NOTHING and answers `recorded: false` (C48);
 *   * a broken backend is a 503, never a refusal the user believes was saved.
 *
 * A strict PostgREST stub (support/recs-postgrest.mjs) answers only the
 * declared queries: a query nobody declared fails the test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signSlate } from '../../scripts/bridge-recs-slate.mjs';
import { CONFIG, callRecs, createRecsStub } from './support/recs-postgrest.mjs';
import { refusalWorld, user } from './support/recs-world.mjs';

const PATH = '/api/recs/not-interested';
const REC_ID = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const OTHER_PAGE = '33333333-3333-4333-8333-333333333333';

/** A slate signed for one user, holding the pages given. */
function slate(items, userId, { issuedAt = Date.now(), recId = REC_ID } = {}) {
	return signSlate(CONFIG.appSessionSecret, { recId, userId, surface: 'home', items, issuedAt });
}

/** The refusal of a page, as the client sends it. */
function refusal(token, pageId = PAGE, extra = {}) {
	return { method: 'POST', path: PATH, body: { slate: token, pageId, ...extra } };
}

/** The rows written in the log. */
const inserts = (stub) => stub.calls.filter((call) => call.table === 'ai_events');

describe('the refusal of a page of the slate', () => {
	it('writes ONE row, with the rank the page held and the session user', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE, OTHER_PAGE], me);
		const answer = await callRecs(stub, { userId: me, ...refusal(token, OTHER_PAGE) });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, recorded: true });
		assert.deepEqual(stub.tables(), ['ai_personalization_settings', 'ai_events']);
		assert.equal(inserts(stub).length, 1);
		assert.deepEqual(inserts(stub)[0].body, {
			user_id: me,
			item_kind: 'page',
			item_id: OTHER_PAGE,
			workspace_id: null,
			event: 'not_interested',
			weight: 0,
			surface: 'home',
			rec_id: REC_ID,
			rank: 2,
		});
	});

	it('writes the row for the SESSION user, whatever the body names', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], me);
		const answer = await callRecs(stub, {
			userId: me,
			...refusal(token, PAGE, { user_id: '44444444-4444-4444-8444-444444444444', userId: OTHER_PAGE }),
		});
		assert.equal(answer.status, 200);
		assert.equal(inserts(stub)[0].body.user_id, me);
	});
});

describe('the slate is the proof (C49)', () => {
	it('refuses the slate of another user, and writes nothing', async () => {
		const me = user();
		const other = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], other);
		const answer = await callRecs(stub, { userId: me, ...refusal(token) });
		assert.equal(answer.status, 400);
		assert.deepEqual(answer.body, { ok: false, code: 'invalid_slate' });
		assert.deepEqual(stub.calls, []);
	});

	it('refuses a tampered slate, and writes nothing', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], me);
		const tampered = `${token.slice(0, -2)}${token.endsWith('aa') ? 'bb' : 'aa'}`;
		const answer = await callRecs(stub, { userId: me, ...refusal(tampered) });
		assert.equal(answer.status, 400);
		assert.deepEqual(answer.body, { ok: false, code: 'invalid_slate' });
		assert.deepEqual(stub.calls, []);
	});

	it('refuses a slate of an hour and a second, and writes nothing', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], me, { issuedAt: Date.now() - 3_601_000 });
		const answer = await callRecs(stub, { userId: me, ...refusal(token) });
		assert.equal(answer.status, 400);
		assert.deepEqual(answer.body, { ok: false, code: 'invalid_slate' });
		assert.deepEqual(stub.calls, []);
	});

	it('refuses a page that is not in the slate, and writes nothing', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], me);
		const answer = await callRecs(stub, { userId: me, ...refusal(token, OTHER_PAGE) });
		assert.equal(answer.status, 400);
		assert.deepEqual(answer.body, { ok: false, code: 'not_in_slate' });
		assert.deepEqual(stub.calls, []);
	});
});

describe('the opt-out, the flag and the broken backend', () => {
	it('writes NOTHING for a user who refused to be tracked (C48)', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({ settings: [{ user_id: me, capture_explicit: false }] }, me));
		const token = slate([PAGE], me);
		const answer = await callRecs(stub, { userId: me, ...refusal(token) });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, recorded: false });
		assert.deepEqual(stub.tables(), ['ai_personalization_settings']);
	});

	it('answers the 404 of a route that does not exist when the flag is off', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me));
		const token = slate([PAGE], me);
		const answer = await callRecs(stub, { userId: me, env: {}, ...refusal(token) });
		assert.equal(answer.status, 404);
		assert.equal(answer.body.ok, false);
		assert.deepEqual(stub.calls, []);
	});

	it('answers a 503 when the log is broken, and never a fake refusal', async () => {
		const me = user();
		const stub = createRecsStub(refusalWorld({}, me), { failing: ['events'] });
		const token = slate([PAGE], me);
		const answer = await callRecs(stub, { userId: me, ...refusal(token) });
		assert.equal(answer.status, 503);
		assert.deepEqual(answer.body, { ok: false });
	});
});
