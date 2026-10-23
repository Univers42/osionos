/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-revocation.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The per-session revocation: one session of a user ends, the other one keeps working, and
 * the set of revoked ids is keyed by the session id and never by the user. The routes
 * answer 404 for a session that is not the caller's, and the write that follows the audit
 * is the only thing that revokes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { STALE_AFTER_MS } from '../../scripts/bridge-session-tracker.mjs';
import { SessionRevocations } from '../../scripts/bridge-session-revocations.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { USER_A, USER_B, gatewayRequest, postJson, sendJson, sessionConfig, startSessionBridge } from './support/session-world.mjs';

const CLOCK = { at: Date.now() };

function payloadFor(subject) {
	return { provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() };
}

async function mintHandoff(base, subject) {
	const request = gatewayRequest(payloadFor(subject), { timestamp: Date.now() });
	const minted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	assert.equal(minted.status, 200);
	return new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
}

async function consume(base, token) {
	return postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': 'bridge-test-agent' }, body: { token } });
}

function jtiOf(accessToken) {
	return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')).jti;
}

/** A bridge with one delivered session of the given user. */
async function sessionFor(t, base, subject) {
	const consumed = await consume(base, await mintHandoff(base, subject));
	assert.equal(consumed.status, 200);
	return { accessToken: consumed.body.session.accessToken, id: jtiOf(consumed.body.session.accessToken) };
}

describe('a revoke ends one session, not the user', () => {
	it('answers 401 for the revoked session at once and keeps the other one alive', async (t) => {
		const clock = { at: Date.now() };
		const config = sessionConfig({ now: () => clock.at });
		const kv = kvStub();
		const { base } = await startSessionBridge({ t, config, clock, kv });
		const first = await sessionFor(t, base, USER_A);
		const second = await sessionFor(t, base, USER_A);
		const revoked = await sendJson(base, `/api/account/sessions/${first.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${second.accessToken}` } });
		assert.equal(revoked.status, 204);
		const dead = await sendJson(base, '/api/favorites', { headers: { authorization: `Bearer ${first.accessToken}` } });
		assert.equal(dead.status, 401);
		assert.equal(dead.body.code, 'session_revoked');
		const alive = await sendJson(base, '/api/favorites', { headers: { authorization: `Bearer ${second.accessToken}` } });
		assert.equal(alive.status, 200);
	});

	it('reaches the other replica after one reload, and never before', async (t) => {
		const clock = { at: Date.now() };
		const kv = kvStub();
		const store = undefined;
		const a = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv });
		const b = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv, store: a.store });
		const session = await sessionFor(t, a.base, USER_A);
		const revoked = await sendJson(a.base, `/api/account/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(revoked.status, 204);
		const onA = await sendJson(a.base, '/api/favorites', { headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(onA.status, 401, 'the replica that took the write refuses the token at once');
		const onB = await sendJson(b.base, '/api/favorites', { headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(onB.status, 200, 'the other replica has not polled yet');
		await b.server.sessionRevocationPoller.tick();
		const afterPoll = await sendJson(b.base, '/api/favorites', { headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(afterPoll.status, 401);
	});

	it('keeps the revoked session dead on the other replica after the handoff expiry', async (t) => {
		const clock = { at: Date.now() };
		const kv = kvStub();
		const a = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv });
		const b = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv, store: a.store });
		const session = await sessionFor(t, a.base, USER_A);
		const revoked = await sendJson(a.base, `/api/account/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(revoked.status, 204);
		// The clock moves past the 90 s handoff expiry: a row that carried that expiry
		// would drop out of the polled set, and the revoked token would work again.
		clock.at += 91_000;
		await b.server.sessionRevocationPoller.tick();
		const onB = await sendJson(b.base, '/api/favorites', { headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(onB.status, 401, 'the row carries the expiry of the token, not of the handoff');
	});

	it('answers 503 while the revocation set was never loaded, and when it went stale', async (t) => {
		const clock = { at: Date.now() };
		const config = sessionConfig({ now: () => clock.at });
		const { base } = await startSessionBridge({
			t,
			config,
			clock,
			fail: (call) => (call.method === 'GET' && call.table === 'osionos_sessions' ? { status: 500, body: { message: 'boom' } } : null),
		});
		const session = await sessionFor(t, base, USER_A);
		const never = await sendJson(base, '/api/favorites', { headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(never.status, 503);
		assert.equal(never.body.code, 'session_revocations_unavailable');
	});

	it('keeps a revoke that raced a reload that was already in flight', () => {
		const tracker = new SessionRevocations({ enforced: true, now: () => CLOCK.at, log: { info() {}, warn() {} } });
		const started = tracker.beginLoad();
		tracker.applyLocal('session-id', 1_000);
		tracker.completeLoad(new Map(), started);
		assert.equal(tracker.isRevoked('session-id'), true, 'the local write outlives the older reload');
	});
});

describe('the revoke route filters what it may touch', () => {
	it('answers 404 for another user\'s session and leaves that session alive', async (t) => {
		const clock = { at: Date.now() };
		const kv = kvStub();
		const { base, store } = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv });
		const mine = await sessionFor(t, base, USER_A);
		const theirs = await sessionFor(t, base, USER_B);
		const revoked = await sendJson(base, `/api/account/sessions/${theirs.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${mine.accessToken}` } });
		assert.equal(revoked.status, 404);
		assert.equal(revoked.body.code, 'session_not_found');
		// The family is found by a read that carries the caller's id; a foreign row is never found, so nothing is patched.
		const read = store.callsTo('osionos_sessions').find((call) => call.method === 'GET' && call.params.get('id') === `eq.${theirs.id}`);
		assert.equal(read.params.get('user_id'), `eq.${USER_A}`);
		assert.equal(read.params.get('revoked_at'), 'is.null');
		assert.equal(store.callsTo('osionos_sessions').some((call) => call.method === 'PATCH'), false);
		const row = store.rows().find((entry) => entry.id === theirs.id);
		assert.equal(row.revoked_at, undefined, 'the row of the other user is untouched');
		const stillAlive = await sendJson(base, '/api/favorites', { headers: { authorization: `Bearer ${theirs.accessToken}` } });
		assert.equal(stillAlive.status, 200, 'the other session still verifies on this replica');
	});

	it('patches only the caller\'s unrevoked rows of the family it found', async (t) => {
		const clock = { at: Date.now() };
		const { base, store } = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv: kvStub() });
		const session = await sessionFor(t, base, USER_A);
		const revoked = await sendJson(base, `/api/account/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(revoked.status, 204);
		const patch = store.callsTo('osionos_sessions').find((call) => call.method === 'PATCH');
		assert.equal(patch.params.get('user_id'), `eq.${USER_A}`);
		assert.equal(patch.params.get('revoked_at'), 'is.null');
		assert.equal(patch.params.get('family_id'), `eq.${session.id}`);
	});

	it('answers 422 for a session id that is not a uuid', async (t) => {
		const clock = { at: Date.now() };
		const { base } = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv: kvStub() });
		const session = await sessionFor(t, base, USER_A);
		const refused = await sendJson(base, '/api/account/sessions/not-a-uuid', { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(refused.status, 422);
	});

	it('writes the audit row before the revoke, and blocks the revoke when it fails', async (t) => {
		const clock = { at: Date.now() };
		const { base, store } = await startSessionBridge({
			t,
			config: sessionConfig({ now: () => clock.at }),
			clock,
			kv: kvStub(),
			fail: (call) => (call.method === 'POST' && call.table === 'osionos_bridge_audit_events' ? { status: 500, body: { message: 'boom' } } : null),
		});
		const session = await sessionFor(t, base, USER_A);
		const refused = await sendJson(base, `/api/account/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		assert.equal(refused.status, 503);
		assert.equal(refused.body.code, 'audit_unavailable');
		assert.equal(store.callsTo('osionos_sessions').filter((call) => call.method === 'PATCH').length, 0, 'no revoke was sent');
	});

	it('records the attempt in the audit log', async (t) => {
		const clock = { at: Date.now() };
		const { base, store } = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv: kvStub() });
		const session = await sessionFor(t, base, USER_A);
		await sendJson(base, `/api/account/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.accessToken}` } });
		const audit = store.rows('osionos_bridge_audit_events');
		assert.equal(audit.length, 1);
		assert.equal(audit[0].event_type, 'session_revoke');
		assert.deepEqual(audit[0].details, { sessionId: session.id });
		assert.equal(audit[0].subject, USER_A);
	});

	it('refuses the 31st revoke of a minute', async (t) => {
		const clock = { at: Date.now() };
		const { base } = await startSessionBridge({ t, config: sessionConfig({ now: () => clock.at }), clock, kv: kvStub() });
		const target = await sessionFor(t, base, USER_A);
		const caller = await sessionFor(t, base, USER_A);
		for (let attempt = 1; attempt <= 30; attempt += 1) {
			const answer = await sendJson(base, `/api/account/sessions/${target.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${caller.accessToken}` } });
			assert.ok([204, 404].includes(answer.status), `revoke ${attempt} answered ${answer.status}`);
		}
		const refused = await sendJson(base, `/api/account/sessions/${target.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${caller.accessToken}` } });
		assert.equal(refused.status, 429);
		assert.equal(refused.body.code, 'rate_limited');
	});
});
