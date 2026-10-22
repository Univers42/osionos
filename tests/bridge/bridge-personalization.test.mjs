/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-personalization.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The user's switch over the recommender's log, and their activity to clear
 * or download (C48, C54).
 *
 * What the routes must hold: the switch lives in the row of the SESSION user
 * (a user id in the body is ignored), the switch has one shape (a boolean and
 * nothing else), the log is read and erased for the session user only, and
 * the burst is answered with a 429.
 *
 * A strict PostgREST stub (support/personalization-postgrest.mjs) answers only
 * the declared queries: a query nobody declared fails the test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { callPersonalization, createPersonalizationStub, uid } from './support/personalization-postgrest.mjs';

/** Every test uses its own user: the rate limit is per user, and it is shared. */
let counter = 500;
const user = () => uid(++counter);

const event = (user_id, id) => ({
	id,
	ts: '2026-10-22T12:00:00.000Z',
	user_id,
	item_kind: 'page',
	item_id: uid(700 + id),
	workspace_id: null,
	event: 'like',
	weight: 1,
	surface: 'trigger',
	rec_id: null,
	rank: null,
	dwell_ms: null,
	is_synthetic: false,
});

/** The vectors the recommender derived from a user: one per model, plus as_item. */
const factors = () => ({
	user_vectors: [
		{ model_id: 3, status: 'champion', trained_until: '2026-10-21T00:00:00+00:00', factors: 16, vector: [0.5, -0.25] },
	],
	as_item: [
		{ model_id: 3, status: 'champion', trained_until: '2026-10-21T00:00:00+00:00', factors: 16, vector: [0.5, -0.25] },
	],
});

describe('GET /api/personalization', () => {
	it('answers the default when the user has no row', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, captureExplicit: true });
	});

	it('answers the switch the row holds', async () => {
		const me = user();
		const stub = createPersonalizationStub({ settings: [{ user_id: me, capture_explicit: false }] });
		const answer = await callPersonalization(stub, { userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, captureExplicit: false });
	});

	it('reads the row of the session user only', async () => {
		const me = user();
		const other = user();
		const stub = createPersonalizationStub({ settings: [{ user_id: other, capture_explicit: false }] });
		const answer = await callPersonalization(stub, { userId: me });
		assert.deepEqual(answer.body, { ok: true, captureExplicit: true });
		assert.match(stub.calls[0].query, new RegExp(`user_id=eq\\.${me}`));
	});
});

describe('PUT /api/personalization', () => {
	it('stores the switch for the session user, whatever user id the body names', async () => {
		const me = user();
		const other = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, {
			method: 'PUT',
			userId: me,
			body: { captureExplicit: false, userId: other },
		});
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, captureExplicit: false });
		const writes = stub.writes();
		assert.equal(writes.length, 1);
		assert.equal(writes[0].body.user_id, me);
		assert.equal(writes[0].body.capture_explicit, false);
		assert.equal(stub.world.settings.length, 1);
		assert.equal(stub.world.settings[0].user_id, me);
	});

	it('stores the switch for the session user when the body names it in snake case', async () => {
		const me = user();
		const other = user();
		const stub = createPersonalizationStub();
		await callPersonalization(stub, { method: 'PUT', userId: me, body: { captureExplicit: true, user_id: other } });
		assert.equal(stub.writes()[0].body.user_id, me);
	});

	it('writes the row with the upsert the database expects', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		await callPersonalization(stub, { method: 'PUT', userId: me, body: { captureExplicit: true } });
		const write = stub.writes()[0];
		assert.equal(write.query, '?on_conflict=user_id');
		assert.equal(write.prefer, 'resolution=merge-duplicates,return=representation');
		assert.ok(write.body.updated_at, 'the row says when it changed');
	});

	it('refuses a switch that is not a boolean, and writes nothing', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { method: 'PUT', userId: me, body: { captureExplicit: 'no' } });
		assert.equal(answer.status, 422);
		assert.deepEqual(answer.body, { ok: false, message: 'captureExplicit must be a boolean.' });
		assert.deepEqual(stub.writes(), []);
	});

	it('refuses a body with no switch at all, and writes nothing', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { method: 'PUT', userId: me, body: {} });
		assert.equal(answer.status, 422);
		assert.deepEqual(stub.writes(), []);
	});

	it('refuses a body with another key, and writes nothing', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, {
			method: 'PUT',
			userId: me,
			body: { captureExplicit: true, captureAll: true },
		});
		assert.equal(answer.status, 422);
		assert.deepEqual(answer.body, { ok: false, message: 'captureExplicit must be a boolean.' });
		assert.deepEqual(stub.writes(), []);
	});
});

describe('GET /api/personalization/activity', () => {
	it('answers the log of the session user, with the columns as stored', async () => {
		const me = user();
		const other = user();
		const stored = [event(me, 1), event(me, 2)];
		const stub = createPersonalizationStub({ events: [...stored, event(other, 3)] });
		const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.ok, true);
		assert.equal(answer.body.events.length, 2);
		assert.deepEqual(answer.body.events[0], stored[0]);
		assert.equal(stub.calls[0].table, 'rpc/ai_export_user');
		assert.deepEqual(stub.calls[0].body, { p_user: me });
	});

	it('answers an empty log as no events at all', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
		assert.deepEqual(answer.body, { ok: true, events: [], derived: { factors: { user_vectors: [], as_item: [] } } });
	});

	it('answers the vectors derived from the user, and asks for them as the session user', async () => {
		const me = user();
		const derived = factors();
		const stub = createPersonalizationStub({ derived });
		const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body.derived, { factors: derived });
		const log = stub.calls.find((call) => call.table === 'rpc/ai_export_user');
		const vectors = stub.calls.find((call) => call.table === 'rpc/ai_rec_export_user');
		assert.deepEqual(log.body, { p_user: me });
		assert.deepEqual(vectors.body, { p_user: me });
	});

	it('answers no vectors when the function is not deployed yet, and still answers the log', async () => {
		const me = user();
		const stub = createPersonalizationStub({ events: [event(me, 1)] }, { missing: ['rec_export'] });
		const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.events.length, 1);
		assert.deepEqual(answer.body.derived, { factors: null });
	});

	it('fails the whole download when the vectors read fails', async () => {
		const me = user();
		const stub = createPersonalizationStub({ events: [event(me, 1)] }, { failing: ['rec_export'] });
		const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
		assert.notEqual(answer.status, 200);
		assert.equal(answer.body.ok, false);
		assert.equal(answer.body.events, undefined);
	});
});

describe('DELETE /api/personalization/activity', () => {
	it('erases the log of the session user, and answers the count', async () => {
		const me = user();
		const other = user();
		const stub = createPersonalizationStub({ events: [event(me, 1), event(me, 2), event(other, 3)] });
		const answer = await callPersonalization(stub, { method: 'DELETE', path: '/api/personalization/activity', userId: me });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, erased: 2 });
		assert.equal(stub.calls[0].table, 'rpc/ai_erase_user');
		assert.deepEqual(stub.calls[0].body, { p_user: me });
		assert.equal(stub.world.events.length, 1);
		assert.equal(stub.world.events[0].user_id, other);
	});
});

describe('the routes and the session', () => {
	it('answers 401 when there is no token at all', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { userId: me, token: null });
		assert.equal(answer.status, 401);
		assert.equal(answer.body.ok, false);
		assert.deepEqual(stub.calls, []);
	});

	it('answers 429 on the twenty-first call of a burst', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answers = [];
		for (let call = 0; call < 21; call += 1) {
			answers.push(await callPersonalization(stub, { userId: me }));
		}
		assert.deepEqual(answers.map((answer) => answer.status), [...Array(20).fill(200), 429]);
		assert.equal(answers[20].body.ok, false);
	});

	it('charges one token per request, not per read: the activity burst ends on the twenty-first call', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const statuses = [];
		for (let call = 0; call < 21; call += 1) {
			const answer = await callPersonalization(stub, { path: '/api/personalization/activity', userId: me });
			statuses.push(answer.status);
		}
		// Two reads per request, one token per request: a limit charged per read
		// would answer 429 on the eleventh call, not the twenty-first.
		assert.deepEqual(statuses, [...Array(20).fill(200), 429]);
	});

	it('leaves the routes it does not own to someone else', async () => {
		const me = user();
		const stub = createPersonalizationStub();
		const answer = await callPersonalization(stub, { path: '/api/personalization/other', userId: me });
		assert.equal(answer.handled, false);
		assert.deepEqual(stub.calls, []);
	});
});
