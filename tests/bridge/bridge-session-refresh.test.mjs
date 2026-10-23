/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-refresh.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The rotating refresh token: what is minted and stored, what a rotation writes, what a
 * second use of a consumed token does to its family, and how a revoke or the list sees a
 * family. Every failure keeps the old token usable unless the family was just killed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { SessionCutoffs } from '../../scripts/bridge-session-cutoff.mjs';
import { USER_A, USER_B, sendJson, sessionConfig, startSessionBridge } from './support/session-world.mjs';
import { refreshWith, signIn } from './support/session-signin.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const bearer = (accessToken) => ({ authorization: `Bearer ${accessToken}` });
const listWith = (base, accessToken) => sendJson(base, '/api/account/sessions', { headers: bearer(accessToken) });
const revokeWith = (base, accessToken, id) => sendJson(base, `/api/account/sessions/${id}`, { method: 'DELETE', headers: bearer(accessToken) });
const newClock = () => ({ at: Date.now() });
const quietLog = { info() {}, warn() {} };

/** An enforced cut-off tracker that holds `entries` (user id -> instant in ms) and reads the test clock. */
function enforcedCutoffs(clock, entries = []) {
	const tracker = new SessionCutoffs({ enforced: true, now: () => clock.at, log: quietLog });
	tracker.completeLoad(new Map(entries.map(([user, ms]) => [user, ms * 1000])), tracker.beginLoad());
	return tracker;
}
const decode = (accessToken) => JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url'));

function seedRow(overrides = {}) {
	const created = overrides.created_at ?? new Date().toISOString();
	return {
		id: randomUUID(), user_id: USER_A, created_at: created, expires_at: new Date(Date.now() + 3_600_000).toISOString(),
		last_seen_at: null, auth_method: 'password', ip_prefix: null, ip_hash: null, user_agent: 'seed',
		revoked_at: null, revoked_reason: null, refresh_hash: null, parent_id: null, ...overrides,
	};
}

describe('a delivered session carries a refresh token', () => {
	it('mints osb_rt, stores only its hash, roots the family at the row', async (t) => {
		const clock = newClock();
		const { base, store } = await startSessionBridge({ clock, t });
		const { answer, refreshToken, claims } = await signIn(base);
		assert.match(refreshToken, /^osb_rt\.[\w-]+\.[\w-]+$/);
		const [row] = store.rows();
		assert.equal(row.refresh_hash, sha256(refreshToken));
		assert.equal(row.family_id, claims.jti);
		assert.equal(row.parent_id, undefined);
		assert.equal(answer.body.expiresAt, claims.exp * 1000);
		assert.ok(!JSON.stringify([store.rows(), store.rows('osionos_bridge_audit_events')]).includes(refreshToken));
	});

	it('mints none while the records are off, and the refresh route says so', async (t) => {
		const config = sessionConfig({ records: 'off' });
		const { base } = await startSessionBridge({ config, t });
		const { refreshToken } = await signIn(base);
		assert.equal(refreshToken, '');
		const refused = await refreshWith(base, 'osb_rt.a.b');
		assert.equal(refused.status, 503);
		assert.equal(refused.body.code, 'session_records_off');
	});
});

describe('a rotation', () => {
	it('inserts a child in the same family and leaves the parent unrevoked', async (t) => {
		const clock = newClock();
		const { base, store } = await startSessionBridge({ clock, t });
		const first = await signIn(base);
		const rotated = await refreshWith(base, first.refreshToken, { 'user-agent': 'someone-else' });
		assert.equal(rotated.status, 200);
		assert.deepEqual(Object.keys(rotated.body).sort(), ['accessToken', 'expiresAt', 'refreshToken']);
		assert.notEqual(rotated.body.refreshToken, first.refreshToken);
		const [parent, child] = store.rows();
		assert.equal(parent.revoked_at, undefined);
		assert.equal(child.parent_id, parent.id);
		assert.equal(child.family_id, parent.family_id);
		assert.equal(child.auth_method, 'refresh');
		assert.equal(child.user_agent, 'bridge-test-agent');
		assert.equal(child.refresh_hash, sha256(rotated.body.refreshToken));
		assert.equal(child.id, JSON.parse(Buffer.from(rotated.body.accessToken.split('.')[1], 'base64url')).jti);
		assert.equal(store.rows('osionos_bridge_audit_events').at(-1).event_type, 'session_refresh');
		assert.equal((await listWith(base, rotated.body.accessToken)).status, 200);
	});

	it('never mints an access token that outlives its family', async (t) => {
		const clock = newClock();
		const { base } = await startSessionBridge({ clock, t });
		const first = await signIn(base);
		const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
		const familyExp = claimsOf(first.refreshToken).exp;
		clock.at = (familyExp - 600) * 1000;
		const rotated = await refreshWith(base, first.refreshToken);
		assert.equal(rotated.status, 200);
		assert.equal(claimsOf(rotated.body.refreshToken).exp, familyExp);
		assert.equal(claimsOf(rotated.body.accessToken).exp, familyExp);
		assert.equal(rotated.body.expiresAt, familyExp * 1000);
	});

	it('writes the audit row before the child row', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		await refreshWith(base, first.refreshToken);
		const order = store.calls.filter((call) => call.method === 'POST').map((call) => `${call.table}:${call.body.event_type ?? call.body.auth_method}`);
		assert.deepEqual(order.slice(-2), ['osionos_bridge_audit_events:session_refresh', 'osionos_sessions:refresh']);
	});

	it('keeps a platform role through a rotation', async (t) => {
		const { base } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		const rotated = await refreshWith(base, first.refreshToken);
		const next = JSON.parse(Buffer.from(rotated.body.accessToken.split('.')[1], 'base64url'));
		assert.equal(next.sub, first.claims.sub);
		assert.deepEqual(next.workspace_ids, first.claims.workspace_ids);
		assert.equal(next.platform_role, first.claims.platform_role);
	});
});

describe('a consumed token used again', () => {
	it('revokes the whole family, audits it and refuses the child too', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		const second = await refreshWith(base, first.refreshToken);
		const replay = await refreshWith(base, first.refreshToken);
		assert.equal(replay.status, 401);
		assert.equal(replay.body.code, 'refresh_token_reused');
		assert.ok(store.rows().every((row) => row.revoked_at && row.revoked_reason === 'refresh_reuse'));
		assert.ok(store.rows('osionos_bridge_audit_events').some((row) => row.event_type === 'session_refresh_reuse'));
		const child = await refreshWith(base, second.body.refreshToken);
		assert.equal(child.status, 401);
		assert.equal(child.body.code, 'session_revoked');
		assert.ok(!replay.text.includes(first.refreshToken));
	});

	it('leaves the user\'s other sign-in alone', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const mine = await signIn(base);
		const other = await signIn(base);
		await refreshWith(base, mine.refreshToken);
		await refreshWith(base, mine.refreshToken);
		const survivor = store.rows().find((row) => row.id === other.claims.jti);
		assert.equal(survivor.revoked_at, undefined);
		assert.equal((await refreshWith(base, other.refreshToken)).status, 200);
	});

	it('treats a lost insert race (23505 on parent_id) as a reuse', async (t) => {
		const { base, store } = await startSessionBridge({
			clock: newClock(),
			t,
			fail: (call) => (call.method === 'POST' && call.table === 'osionos_sessions' && call.body.parent_id ? { status: 409, body: { code: '23505' } } : null),
		});
		const first = await signIn(base);
		const raced = await refreshWith(base, first.refreshToken);
		assert.equal(raced.status, 401);
		assert.equal(raced.body.code, 'refresh_token_reused');
		assert.ok(store.rows().every((row) => row.revoked_reason === 'refresh_reuse'));
	});
});

describe('a rotation racing another request', () => {
	it('revokes the new child too when the family was revoked between the read and the insert', async (t) => {
		let store;
		let armed = false;
		const world = await startSessionBridge({
			clock: newClock(),
			t,
			fail: (call) => {
				if (armed && call.method === 'POST' && call.table === 'osionos_sessions') {
					for (const row of store.rows()) row.revoked_at = new Date().toISOString();
				}
				return null;
			},
		});
		const { base } = world;
		store = world.store;
		const first = await signIn(base);
		armed = true;
		const answer = await refreshWith(base, first.refreshToken);
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'session_revoked');
		assert.ok(store.rows().every((row) => row.revoked_at), 'the child is revoked as well');
	});

	it('lets exactly one of two concurrent refreshes with one token win and kills the family', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		const [left, right] = await Promise.all([refreshWith(base, first.refreshToken), refreshWith(base, first.refreshToken)]);
		assert.deepEqual([left.status, right.status].sort(), [200, 401]);
		const loser = left.status === 401 ? left : right;
		const winner = left.status === 200 ? left : right;
		assert.equal(loser.body.code, 'refresh_token_reused');
		assert.ok(store.rows().every((row) => row.revoked_at));
		assert.equal((await refreshWith(base, winner.body.refreshToken)).body.code, 'session_revoked');
	});
});

describe('a refresh re-reads what the account may do', () => {
	const grants = { ids: [{ role_id: 'r1' }], roles: [{ id: 'r1', name: 'moderator' }], admin: false };
	const failFor = () => (call) => {
		if (call.table === 'user_roles') return { status: 200, body: grants.ids };
		if (call.table === 'roles') return { status: 200, body: grants.roles };
		if (call.table === 'osionos_bridge_identities' && call.method === 'GET') return { status: 200, body: [{ is_admin: grants.admin }] };
		return null;
	};

	it('mints a token without the role a user lost between login and refresh', async (t) => {
		Object.assign(grants, { ids: [{ role_id: 'r1' }], roles: [{ id: 'r1', name: 'moderator' }], admin: false });
		const { base } = await startSessionBridge({ clock: newClock(), t, fail: failFor() });
		const first = await signIn(base);
		assert.equal(first.claims.platform_role, 'moderator');
		grants.ids = [];
		const rotated = await refreshWith(base, first.refreshToken);
		assert.equal(rotated.status, 200);
		assert.ok(!decode(rotated.body.accessToken).platform_role);
	});

	it('mints a non-admin token for an admin who was demoted', async (t) => {
		Object.assign(grants, { ids: [], roles: [], admin: true });
		const { base } = await startSessionBridge({ clock: newClock(), t, fail: failFor() });
		const first = await signIn(base);
		assert.equal(first.claims.is_admin, true);
		grants.admin = false;
		const rotated = await refreshWith(base, first.refreshToken);
		const next = decode(rotated.body.accessToken);
		assert.notEqual(next.is_admin, true);
		assert.ok(!next.platform_role);
	});
});

describe('a refresh that fails', () => {
	const hostile = [
		['no body token', () => undefined, 422, 'refresh_token_required'],
		['not a refresh token', () => 'osionos_v1.a.b', 401, 'refresh_token_invalid'],
		['a tampered mac', (token) => `${token.slice(0, -2)}AA`, 401, 'refresh_token_invalid'],
	];
	for (const [name, mutate, status, code] of hostile) {
		it(`answers ${status} ${code} for ${name}`, async (t) => {
			const { base, store } = await startSessionBridge({ clock: newClock(), t });
			const first = await signIn(base);
			const answer = await refreshWith(base, mutate(first.refreshToken));
			assert.equal(answer.status, status);
			assert.equal(answer.body.code, code);
			assert.equal(store.rows().length, 1);
		});
	}

	it('refuses an expired token', async (t) => {
		const clock = newClock();
		const { base } = await startSessionBridge({ clock, t });
		const first = await signIn(base);
		clock.at += 8 * 24 * 3_600_000;
		const answer = await refreshWith(base, first.refreshToken);
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'refresh_token_expired');
	});

	it('refuses a token whose row belongs to another user', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		store.rows()[0].user_id = USER_B;
		const answer = await refreshWith(base, first.refreshToken);
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'refresh_token_invalid');
	});

	it('refuses a revoked session and never reads an Authorization header', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		const header = await refreshWith(base, undefined, bearer(first.accessToken));
		assert.equal(header.status, 422);
		store.rows()[0].revoked_at = new Date().toISOString();
		const answer = await refreshWith(base, first.refreshToken);
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'session_revoked');
	});

	it('refuses a child created after the cutoff when the family root predates it', async (t) => {
		const clock = newClock();
		const config = sessionConfig({ now: () => clock.at });
		config.sessionCutoffs = enforcedCutoffs(clock);
		const { base } = await startSessionBridge({ config, clock, t });
		const first = await signIn(base);
		clock.at += 2000;
		const child = await refreshWith(base, first.refreshToken);
		assert.equal(child.status, 200);
		config.sessionCutoffs.entries.set(USER_A, (first.claims.iat_ms + 1000) * 1000);
		const answer = await refreshWith(base, child.body.refreshToken);
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'session_revoked');
	});

	it('answers 503, not a mint, while the cutoff table is stale', async (t) => {
		const clock = newClock();
		const config = sessionConfig({ now: () => clock.at });
		config.sessionCutoffs = enforcedCutoffs(clock);
		const { base, store } = await startSessionBridge({ config, clock, t });
		const first = await signIn(base);
		clock.at += 10 * 60_000;
		const answer = await refreshWith(base, first.refreshToken);
		assert.equal(answer.status, 503);
		assert.equal(answer.body.code, 'session_cutoffs_unavailable');
		assert.equal(store.rows().length, 1);
	});

	it('does not let 100 invalid tokens spend the bucket of a valid one', async (t) => {
		const { base } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		for (let attempt = 0; attempt < 100; attempt += 1) await refreshWith(base, 'osb_rt.garbage.garbage');
		assert.equal((await refreshWith(base, first.refreshToken)).status, 200);
	});

	it('refuses a real access token as a refresh token, and a refresh token as a bearer', async (t) => {
		const { base } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		assert.equal((await refreshWith(base, first.accessToken)).status, 401);
		const disguised = first.refreshToken.replace(/^osb_rt/, 'osionos_v1');
		assert.equal((await listWith(base, disguised)).status, 401);
	});

	const unavailable = [
		['audit', 'osionos_bridge_audit_events', 'audit_unavailable'],
		['child insert', 'osionos_sessions', 'session_record_unavailable'],
	];
	for (const [name, table, code] of unavailable) {
		it(`answers 503 ${code} on a failed ${name} and the old token still works`, async (t) => {
			let broken = false;
			const { base, store } = await startSessionBridge({
				clock: newClock(),
				t,
				fail: (call) => (broken && call.method === 'POST' && call.table === table ? { status: 500, body: {} } : null),
			});
			const first = await signIn(base);
			broken = true;
			const refused = await refreshWith(base, first.refreshToken);
			assert.equal(refused.status, 503);
			assert.equal(refused.body.code, code);
			assert.equal(store.rows().length, 1);
			broken = false;
			assert.equal((await refreshWith(base, first.refreshToken)).status, 200);
		});
	}
});

describe('revoking a session revokes its family', () => {
	it('revokes every generation of the named family and only that family', async (t) => {
		const { base, store } = await startSessionBridge({ clock: newClock(), t });
		const other = await signIn(base);
		const first = await signIn(base);
		const second = await refreshWith(base, first.refreshToken);
		const third = await refreshWith(base, second.body.refreshToken);
		const shown = (await listWith(base, third.body.accessToken)).body.sessions.find((entry) => entry.current);
		assert.equal((await revokeWith(base, third.body.accessToken, shown.id)).status, 204);
		const family = store.rows().filter((row) => row.family_id === first.claims.jti);
		assert.equal(family.length, 3);
		assert.ok(family.every((row) => row.revoked_reason === 'user'));
		assert.equal(store.rows().find((row) => row.id === other.claims.jti).revoked_at, undefined);
		assert.equal((await refreshWith(base, third.body.refreshToken)).body.code, 'session_revoked');
	});

	it('answers 404 for another user\'s row and for an already revoked one', async (t) => {
		const { base } = await startSessionBridge({ clock: newClock(), t });
		const mine = await signIn(base);
		const viewer = await signIn(base);
		const theirs = await signIn(base, USER_B);
		assert.equal((await revokeWith(base, mine.accessToken, theirs.claims.jti)).status, 404);
		assert.equal((await revokeWith(base, viewer.accessToken, mine.claims.jti)).status, 204);
		assert.equal((await revokeWith(base, viewer.accessToken, mine.claims.jti)).status, 404);
	});

	it('revokes only the named row when it has no family', async (t) => {
		const legacy = [seedRow(), seedRow()];
		const { base, store } = await startSessionBridge({ clock: newClock(), t, rows: legacy });
		const me = await signIn(base);
		assert.equal((await revokeWith(base, me.accessToken, legacy[0].id)).status, 204);
		assert.ok(store.rows().find((row) => row.id === legacy[0].id).revoked_at);
		assert.equal(store.rows().find((row) => row.id === legacy[1].id).revoked_at, null);
	});
});

describe('the list shows one row per family', () => {
	const KEYS = ['authMethod', 'createdAt', 'current', 'expiresAt', 'id', 'ipPrefix', 'lastSeenAt', 'userAgent'];

	it('collapses a 60-generation family, keeps NULL families apart, survives 50+ rows', async (t) => {
		const family = randomUUID();
		const at = (offset) => new Date(Date.now() - 3_000_000 + offset).toISOString();
		const generations = Array.from({ length: 60 }, (_, index) => seedRow({ family_id: family, created_at: at(index) }));
		const legacy = [seedRow({ created_at: at(-10) }), seedRow({ created_at: at(-20) })];
		const { base } = await startSessionBridge({ clock: newClock(), t, rows: [...generations, ...legacy] });
		const me = await signIn(base);
		const { sessions } = (await listWith(base, me.accessToken)).body;
		assert.equal(sessions.length, 4);
		assert.deepEqual(Object.keys(sessions.find((entry) => entry.id === legacy[0].id)).sort(), KEYS);
		assert.equal(sessions.filter((entry) => entry.current).length, 1);
		assert.equal(sessions.find((entry) => entry.id === generations[59].id).current, false);
	});

	it('reads past the first page to find an older family', async (t) => {
		const crowd = randomUUID();
		const future = Date.now() + 1000;
		const rows = Array.from({ length: 1200 }, (_, index) => seedRow({ family_id: crowd, created_at: new Date(future + index).toISOString() }));
		const old = seedRow({ created_at: new Date(Date.now() - 600_000).toISOString() });
		const { base } = await startSessionBridge({ clock: newClock(), t, rows: [...rows, old] });
		const me = await signIn(base);
		const { sessions } = (await listWith(base, me.accessToken)).body;
		assert.deepEqual(sessions.map((entry) => entry.id).includes(old.id), true);
		assert.equal(sessions.length, 3);
	});

	it('shows the caller\'s own generation for its family', async (t) => {
		const { base } = await startSessionBridge({ clock: newClock(), t });
		const first = await signIn(base);
		const second = await refreshWith(base, first.refreshToken);
		const { sessions } = (await listWith(base, second.body.accessToken)).body;
		assert.equal(sessions.length, 1);
		assert.equal(sessions[0].current, true);
	});
});
