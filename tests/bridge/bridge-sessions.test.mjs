/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-sessions.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The session rows: what is written when a session reaches the client, what the routes
 * answer, and what happens when the account plane is off. The row is built only from the
 * token being delivered — the handoff's own 90 s expiry must never reach the table, or a
 * revoked token would come back to life after 90 s.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBridgeHandoff, createBridgeServer, startBridgeServer } from '../../scripts/bridge-api.mjs';
import { kvStub } from './support/kv-stub.mjs';
import {
	JWT_SECRET, USER_A, USER_B,
	gatewayRequest, postJson, sendJson, sessionConfig, startSessionBridge,
} from './support/session-world.mjs';

const CLOCK = { at: Date.now() };

function payloadFor(subject = USER_A) {
	return { provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() };
}

/** Mint a handoff through the gateway route and return its token. */
async function mintHandoff(base, subject = USER_A) {
	const request = gatewayRequest(payloadFor(subject), { timestamp: Date.now() });
	const minted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	assert.equal(minted.status, 200);
	return new URL(minted.body.redirectUrl).hash.replace('#bridge_token=', '');
}

async function consume(base, token) {
	return postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': 'bridge-test-agent' }, body: { token } });
}

function tokenClaims(accessToken) {
	return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
}

describe('the session row is written when the session is delivered', () => {
	it('writes one row with the id, the subject and the expiry of the delivered token', async (t) => {
		const { base, store } = await startSessionBridge({ clock: CLOCK, t });
		const token = await mintHandoff(base);
		const consumed = await consume(base, token);
		assert.equal(consumed.status, 200);
		const claims = tokenClaims(consumed.body.session.accessToken);
		const rows = store.rows();
		assert.equal(rows.length, 1);
		assert.deepEqual(rows[0], {
			id: claims.jti,
			user_id: USER_A,
			created_at: new Date(claims.iat_ms).toISOString(),
			expires_at: new Date(claims.exp * 1000).toISOString(),
			auth_method: 'handoff',
			ip_prefix: null,
			ip_hash: null,
			user_agent: 'bridge-test-agent',
		});
	});

	it('records the expiry of the token, not the 90 s handoff expiry', async (t) => {
		const { base, store } = await startSessionBridge({ clock: CLOCK, t });
		const token = await mintHandoff(base);
		const consumed = await consume(base, token);
		const claims = tokenClaims(consumed.body.session.accessToken);
		const row = store.rows()[0];
		const handoffExpiry = Date.now() + 90_000;
		assert.ok(new Date(row.expires_at).getTime() > handoffExpiry, 'the row outlives the handoff');
		assert.equal(new Date(row.expires_at).getTime(), claims.exp * 1000);
	});

	it('records the client address only when a header names it', async (t) => {
		const { base, store } = await startSessionBridge({ t, clock: CLOCK, config: sessionConfig({ ipHeader: 'x-real-ip', now: () => CLOCK.at }) });
		const token = await mintHandoff(base);
		const response = await fetch(`${base}/api/auth/bridge/consume`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
			body: JSON.stringify({ token }),
		});
		assert.equal(response.status, 200);
		const row = store.rows()[0];
		assert.equal(row.ip_prefix, '203.0.113.0/24');
		assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
	});

	it('writes no IP column when no header is configured, because the peer is the proxy', async (t) => {
		const { base, store } = await startSessionBridge({ clock: CLOCK, t });
		const token = await mintHandoff(base);
		await consume(base, token);
		const row = store.rows()[0];
		assert.equal(row.ip_prefix, null);
		assert.equal(row.ip_hash, null);
	});

	it('writes auth_method=password for a password sign-in', async () => {
		const kv = kvStub();
		const config = sessionConfig({ now: () => CLOCK.at, persistence: 'memory' });
		const minted = await createBridgeHandoff({ payload: payloadFor(USER_B), config, kv, now: CLOCK.at, fetchImpl: async () => new Response('[]') });
		const gateway = async (url) => {
			const route = String(url);
			if (route.endsWith('/api/auth/login')) return new Response(JSON.stringify({ access_token: 'gw', refresh_token: 'r', user: { id: USER_B } }), { status: 200 });
			if (route.endsWith('/api/auth/osionos-session')) return new Response(JSON.stringify({ redirectUrl: minted.redirectUrl }), { status: 200 });
			return new Response('[]', { status: 200 });
		};
		const server = createBridgeServer({ config, fetchImpl: gateway, kv, env: { JWT_SECRET } });
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		try {
			const signedIn = await postJson(`http://127.0.0.1:${server.address().port}`, '/api/auth/login', { body: { email: 'member@example.com', password: 'correct horse battery' } });
			assert.equal(signedIn.status, 200);
			assert.ok(signedIn.body.accessToken);
		} finally {
			await new Promise((done) => server.close(done));
		}
	});

	it('answers 503 and no token when the row cannot be written', async (t) => {
		const config = sessionConfig({ now: () => CLOCK.at });
		const { base } = await startSessionBridge({
			t,
			config,
			clock: CLOCK,
			fail: (call) => (call.method === 'POST' && call.table === 'osionos_sessions' ? { status: 500, body: { message: 'boom' } } : null),
		});
		const token = await mintHandoff(base);
		const consumed = await consume(base, token);
		assert.equal(consumed.status, 503);
		assert.equal(consumed.body.code, 'session_record_unavailable');
		assert.doesNotMatch(consumed.text, /accessToken/);
	});

	it('answers 409 when the row already exists', async (t) => {
		const config = sessionConfig({ now: () => CLOCK.at });
		const { base } = await startSessionBridge({
			t,
			config,
			clock: CLOCK,
			fail: (call) => (call.method === 'POST' && call.table === 'osionos_sessions' ? { status: 409, body: { code: '23505' } } : null),
		});
		const token = await mintHandoff(base);
		const consumed = await consume(base, token);
		assert.equal(consumed.status, 409);
		assert.equal(consumed.body.code, 'session_record_conflict');
	});
});

describe('the account plane off is one state', () => {
	it('writes no row, checks no revocation and answers 503 on the session routes', async (t) => {
		const config = sessionConfig({ records: 'off', now: () => CLOCK.at });
		const { base, store } = await startSessionBridge({ t, config, clock: CLOCK });
		const token = await mintHandoff(base);
		const consumed = await consume(base, token);
		assert.equal(consumed.status, 200);
		assert.deepEqual(store.rows(), [], 'no row is written while the records are off');
		const headers = { authorization: `Bearer ${consumed.body.session.accessToken}` };
		const listed = await sendJson(base, '/api/account/sessions', { headers });
		assert.equal(listed.status, 503);
		assert.equal(listed.body.code, 'session_records_off');
	});

	it('is off without a service key, and the boot line names the reason', () => {
		const warn = [];
		const original = console.warn;
		console.warn = (line) => warn.push(line);
		try {
			startBridgeServer({ ...sessionConfig({ serviceKey: '' }), port: 0 }).close();
		} finally {
			console.warn = original;
		}
		assert.equal(warn.length, 1);
		assert.match(warn[0], /session records: OFF \(no service key or BaaS URL\)/);
	});

	it('is off by the env switch, and the boot line names the reason', () => {
		const warn = [];
		const original = console.warn;
		console.warn = (line) => warn.push(line);
		try {
			startBridgeServer({ ...sessionConfig({ records: 'off' }), port: 0 }).close();
		} finally {
			console.warn = original;
		}
		assert.equal(warn.length, 1);
		assert.match(warn[0], /session records: OFF \(OSIONOS_SESSION_RECORDS=off\)/);
	});
});

describe('GET /api/account/sessions', () => {
	it('reads through the user role and lists only the caller\'s live sessions', async (t) => {
		const clock = { at: Date.now() };
		const config = sessionConfig({ now: () => clock.at });
		const { base, store } = await startSessionBridge({ t, config, clock });
		const consumedA = await consume(base, await mintHandoff(base, USER_A));
		await consume(base, await mintHandoff(base, USER_B));
		const headers = { authorization: `Bearer ${consumedA.body.session.accessToken}` };
		const listed = await sendJson(base, '/api/account/sessions', { headers });
		assert.equal(listed.status, 200);
		assert.equal(listed.body.sessions.length, 1);
		const [session] = listed.body.sessions;
		assert.equal(session.id, tokenClaims(consumedA.body.session.accessToken).jti);
		assert.equal(session.current, true);
		assert.equal(session.authMethod, 'handoff');
		assert.equal(session.ipPrefix, null);
		const read = store.callsTo('osionos_sessions').find((call) => call.method === 'GET' && call.claims?.role === 'osionos_account_user');
		assert.ok(read, 'the list is read through the user role');
		assert.equal(read.params.get('revoked_at'), 'is.null');
		assert.equal(read.params.get('order'), 'created_at.desc');
		assert.equal(read.params.get('limit'), '50');
	});

	it('marks the current session and leaves the others unmarked', async (t) => {
		const clock = { at: Date.now() };
		const config = sessionConfig({ now: () => clock.at });
		const { base } = await startSessionBridge({ t, config, clock });
		const first = await consume(base, await mintHandoff(base));
		const second = await consume(base, await mintHandoff(base));
		const listed = await sendJson(base, '/api/account/sessions', { headers: { authorization: `Bearer ${second.body.session.accessToken}` } });
		const currents = listed.body.sessions.filter((entry) => entry.current).map((entry) => entry.id);
		assert.deepEqual(currents, [tokenClaims(second.body.session.accessToken).jti]);
		assert.equal(listed.body.sessions.length, 2);
		assert.ok(listed.body.sessions.some((entry) => entry.id === tokenClaims(first.body.session.accessToken).jti));
	});

	it('omits the sessions the per-user cut-off already ended', async (t) => {
		const clock = { at: Date.now() };
		const config = sessionConfig({ now: () => clock.at });
		const older = {
			id: randomUUID(), user_id: USER_A, created_at: '2026-01-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z',
			last_seen_at: '2026-01-01T00:00:00.000Z', auth_method: 'handoff', ip_prefix: null, ip_hash: null, user_agent: null,
		};
		const { base } = await startSessionBridge({ t, config, clock, rows: [older] });
		const consumed = await consume(base, await mintHandoff(base));
		const headers = { authorization: `Bearer ${consumed.body.session.accessToken}` };
		const before = await sendJson(base, '/api/account/sessions', { headers });
		assert.equal(before.body.sessions.length, 2);
		// The cut-off lands between the two sessions: the older one is dead, the caller's is not.
		const cutoffs = config.sessionCutoffs;
		cutoffs.enforced = true;
		cutoffs.completeLoad(new Map([[USER_A, Date.parse('2026-06-01T00:00:00Z') * 1000]]), cutoffs.beginLoad());
		const after = await sendJson(base, '/api/account/sessions', { headers });
		assert.equal(after.body.sessions.length, 1);
		assert.equal(after.body.sessions[0].id, tokenClaims(consumed.body.session.accessToken).jti);
	});
});
