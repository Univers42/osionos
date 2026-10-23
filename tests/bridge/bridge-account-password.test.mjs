/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-password.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/password: the change of the account password behind a sudo grant.
 *
 * The world is the whole bridge with session records ON, so the refresh route is real: the
 * claim that matters is "every other sign-in is dead, the caller's own keeps working", and
 * only a refresh against the family rows proves it. GoTrue's admin route is a fake on the
 * global fetch (the account modules call it the way the sudo module does); the shared
 * PostgREST fake serves `neq`, so the real filter of the revoke is what is exercised.
 * Every password in this file is an obviously fake value.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signAppSessionToken } from '../../scripts/bridge-session-token.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { refreshWith, signIn } from './support/session-signin.mjs';
import { send, startAccountWorld, sudoToken } from './support/account-world.mjs';
import { USER_A, USER_B, sendJson, sessionConfig, startSessionBridge } from './support/session-world.mjs';
import { createSessionStore } from './support/session-postgrest.mjs';
import { patRow } from './support/pat-world.mjs';

const ADDRESS = 'ada.lovelace@example.com';
const FAKE_PASSWORD = 'Fake-Passw0rd-for-tests';
const PATH = '/api/account/password';
const SESSIONS = 'osionos_sessions';
const AUDIT = 'osionos_bridge_audit_events';

const lower = (value) => String(value).toLowerCase();

/**
 * Builds the bridge, the PostgREST and GoTrue's admin route. GoTrue and the PostgREST are
 * both reached through the global fetch by the account modules, so one override serves both.
 */
async function world(t, { records = 'on', putStatus = 200, address = ADDRESS, kv = createTtlKv() } = {}) {
	const faults = { fail: null };
	const store = createSessionStore({ fail: (call) => faults.fail?.(call) });
	const gotrue = { puts: [], gets: [], auditAtPut: [] };
	const original = globalThis.fetch;
	globalThis.fetch = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.host !== 'baas.local') return original(url, init);
		if (parsed.pathname.startsWith('/rest/v1/')) return store.fetchImpl(url, init);
		if (!parsed.pathname.startsWith('/auth/v1/admin/users/')) return new Response('{}', { status: 404 });
		const record = { path: parsed.pathname, headers: { ...init.headers }, body: init.body ? JSON.parse(init.body) : undefined };
		if ((init.method ?? 'GET') === 'GET') {
			gotrue.gets.push(record);
			return new Response(JSON.stringify({ id: USER_A, email: address }), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		gotrue.auditAtPut = store.rows(AUDIT).map((row) => row.event_type);
		gotrue.puts.push(record);
		return new Response('{}', { status: gotrue.putStatus ?? putStatus, headers: { 'content-type': 'application/json' } });
	};
	t.after(() => { globalThis.fetch = original; });
	const config = sessionConfig({ records });
	const bridge = await startSessionBridge({ config, store, kv, t });
	const grantSudo = (claims, userId = USER_A) => kv.set(`sudo:${claims.jti}`, userId, 600_000);
	const change = (token, body) => send(bridge.base, PATH, { method: 'POST', token, body });
	return { ...bridge, config, store, gotrue, kv, grantSudo, change, faults };
}

const revokedRows = (store, userId) => store.rows(SESSIONS).filter((row) => lower(row.user_id) === lower(userId) && row.revoked_at);

describe('POST /api/account/password: who may call it', () => {
	it('answers 401 without a session and 405 on another method', async (t) => {
		const { base, gotrue, store } = await world(t);
		assert.equal((await sendJson(base, PATH, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status, 401);
		const { accessToken } = await signIn(base);
		const wrongMethod = await sendJson(base, PATH, { headers: { authorization: `Bearer ${accessToken}` } });
		assert.deepEqual([wrongMethod.status, wrongMethod.body.code], [405, 'method_not_allowed']);
		assert.equal(gotrue.puts.length, 0);
		assert.equal(store.rows(AUDIT).length, 0);
	});

	it('answers 403 sudo_required without a grant, writes nothing and revokes nothing', async (t) => {
		const { base, change, gotrue, store } = await world(t);
		const caller = await signIn(base);
		await signIn(base, USER_A, 'other-device');
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [403, 'sudo_required']);
		assert.equal(gotrue.puts.length, 0);
		assert.equal(store.rows(AUDIT).filter((row) => row.event_type === 'account.password_changed').length, 0);
		assert.equal(revokedRows(store, USER_A).length, 0);
	});

	it('refuses a grant that belongs to another session', async (t) => {
		const { base, change, grantSudo, gotrue } = await world(t);
		const caller = await signIn(base);
		const other = await signIn(base, USER_A, 'other-device');
		await grantSudo(other.claims);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [403, 'sudo_required']);
		assert.equal(gotrue.puts.length, 0);
	});

	it('answers 403 mfa_required to a token whose second step is still pending', async (t) => {
		const { change, config, gotrue } = await world(t);
		const { token } = signAppSessionToken({ payload: { subject: USER_A, provider: 'prismatica' }, workspace: { _id: USER_A }, config, aal: 1, mfaReq: true });
		const answer = await change(token, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [403, 'mfa_required']);
		assert.equal(gotrue.puts.length, 0);
	});
});

describe('POST /api/account/password: the password', () => {
	const refused = [
		['too short', { nextPassword: 'Ab1!xyz' }],
		['too long', { nextPassword: `Ab1!${'x'.repeat(125)}` }],
		['100 bytes', { nextPassword: `Ab1!${'x'.repeat(96)}` }],
		['over 72 bytes though under 72 characters', { nextPassword: `Ab1!${'é'.repeat(35)}` }],
		['one character class', { nextPassword: 'abcdefghijklmnop' }],
		['two character classes', { nextPassword: 'abcdefgh12345' }],
		['not a string', { nextPassword: 1234567890123 }],
		['missing', {}],
		['the old field name', { newPassword: FAKE_PASSWORD }],
		['an unknown key beside it', { nextPassword: FAKE_PASSWORD, userId: USER_B }],
	];
	for (const [name, body] of refused) {
		it(`answers 422 and writes nothing when it is ${name}`, async (t) => {
			const { base, change, grantSudo, gotrue, store } = await world(t);
			const caller = await signIn(base);
			await grantSudo(caller.claims);
			const answer = await change(caller.accessToken, body);
			assert.equal(answer.status, 422, answer.text);
			assert.match(answer.body.code, /^invalid_/);
			assert.equal(gotrue.puts.length, 0);
			assert.equal(revokedRows(store, USER_A).length, 0);
		});
	}

	it('refuses the address of the account as its own password', async (t) => {
		const mixed = 'Ada.Lovelace1@Example.com';
		const { base, change, grantSudo, gotrue } = await world(t, { address: mixed.toLowerCase() });
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		const answer = await change(caller.accessToken, { nextPassword: mixed });
		assert.deepEqual([answer.status, answer.body.code], [422, 'invalid_password']);
		assert.equal(gotrue.puts.length, 0);
	});
});

describe('POST /api/account/password: the change', () => {
	it('sets the password for the caller only, audits first, ignores currentPassword and spends the grant', async (t) => {
		const { base, change, grantSudo, gotrue, store, kv } = await world(t);
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD, currentPassword: 'Fake-Old-Passw0rd' });
		assert.equal(answer.status, 204, answer.text);
		assert.equal(gotrue.puts.length, 1);
		assert.equal(gotrue.puts[0].path, `/auth/v1/admin/users/${USER_A}`);
		assert.deepEqual(gotrue.puts[0].body, { password: FAKE_PASSWORD });
		assert.equal(gotrue.puts[0].headers.apikey, 'service-role-test-key');
		assert.ok(gotrue.auditAtPut.includes('account.password_changed'), 'the audit row is written before the password is');
		const audit = store.rows(AUDIT).find((row) => row.event_type === 'account.password_changed');
		assert.deepEqual([audit.subject, audit.session_id, audit.details], [USER_A, caller.claims.jti, {}]);
		assert.equal(kv.has(`sudo:${caller.claims.jti}`), false);
		assert.doesNotMatch(JSON.stringify([store.rows(AUDIT), store.calls]), /Fake-Passw0rd|Fake-Old/);
		const again = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([again.status, again.body.code], [403, 'sudo_required']);
	});

	it('kills every other family, refresh token included, and keeps the caller\'s own family rotating', async (t) => {
		const { base, change, grantSudo, store } = await world(t);
		const first = await signIn(base);
		const rotated = await refreshWith(base, first.refreshToken);
		assert.equal(rotated.status, 200);
		const callerClaims = JSON.parse(Buffer.from(rotated.body.accessToken.split('.')[1], 'base64url').toString('utf8'));
		const elsewhere = await signIn(base, USER_A, 'other-device');
		const stranger = await signIn(base, USER_B, 'stranger-device');
		await grantSudo(callerClaims);

		const answer = await change(rotated.body.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.equal(answer.status, 204, answer.text);

		assert.equal((await refreshWith(base, elsewhere.refreshToken)).status, 401);
		const own = await refreshWith(base, rotated.body.refreshToken);
		assert.equal(own.status, 200, own.text);
		assert.equal((await refreshWith(base, stranger.refreshToken)).status, 200);
		const live = store.rows(SESSIONS).filter((row) => row.family_id === first.claims.jti);
		assert.equal(live.some((row) => row.revoked_at), false, 'no generation of the caller\'s family is revoked');
		assert.deepEqual(revokedRows(store, USER_A).map((row) => [row.family_id, row.revoked_reason]), [[elsewhere.claims.jti, 'password_change']]);
		assert.equal(store.callsTo(SESSIONS).filter((call) => call.method === 'PATCH').length, 1, 'one PATCH revokes them all');
	});

	it('answers 503 account_plane_unavailable, revokes nothing and gives the grant back when GoTrue refuses the write', async (t) => {
		const { base, change, grantSudo, store, gotrue, kv } = await world(t, { putStatus: 500 });
		const caller = await signIn(base);
		await signIn(base, USER_A, 'other-device');
		await grantSudo(caller.claims);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [503, 'account_plane_unavailable']);
		assert.equal(revokedRows(store, USER_A).length, 0);
		assert.equal(kv.has(`sudo:${caller.claims.jti}`), true, 'the grant is restored');
		gotrue.putStatus = 200;
		assert.equal((await change(caller.accessToken, { nextPassword: FAKE_PASSWORD })).status, 204);
	});

	it('keeps the meaning of a GoTrue 422: 422 invalid_password, a fixed message, the grant restored', async (t) => {
		const { base, change, grantSudo, kv } = await world(t, { putStatus: 422 });
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [422, 'invalid_password']);
		assert.doesNotMatch(answer.text, /Fake-Passw0rd/);
		assert.equal(kv.has(`sudo:${caller.claims.jti}`), true);
	});

	it('spends one grant once: two parallel requests make one GoTrue write and one 204', async (t) => {
		const { base, change, grantSudo, gotrue } = await world(t);
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		const answers = await Promise.all([1, 2].map(() => change(caller.accessToken, { nextPassword: FAKE_PASSWORD })));
		assert.deepEqual(answers.map((answer) => answer.status).sort(), [204, 403]);
		assert.equal(gotrue.puts.length, 1);
		assert.equal(answers.find((answer) => answer.status === 403).body.code, 'sudo_required');
	});

	it('keeps a legacy caller (no family) and revokes a legacy stranger, but not a row that was already revoked', async (t) => {
		const { base, change, grantSudo, store } = await world(t);
		const caller = await signIn(base);
		const elsewhere = await signIn(base, USER_A, 'other-device');
		const rows = store.rows(SESSIONS);
		const row = (claims) => rows.find((candidate) => lower(candidate.id) === lower(claims.jti));
		row(caller.claims).family_id = null;
		const legacy = { ...row(elsewhere.claims), id: '00000000-0000-4000-8000-0000000000a1', family_id: null };
		const already = { ...row(elsewhere.claims), id: '00000000-0000-4000-8000-0000000000a2', family_id: '00000000-0000-4000-8000-0000000000a2', revoked_at: '2026-01-01T00:00:00.000Z', revoked_reason: 'user' };
		rows.push(legacy, already);
		await grantSudo(caller.claims);
		assert.equal((await change(caller.accessToken, { nextPassword: FAKE_PASSWORD })).status, 204);
		assert.equal(row(caller.claims).revoked_at ?? null, null, 'the legacy caller keeps its sign-in');
		assert.ok(legacy.revoked_at, 'a legacy stranger is revoked');
		assert.ok(row(elsewhere.claims).revoked_at);
		assert.deepEqual([already.revoked_at, already.revoked_reason], ['2026-01-01T00:00:00.000Z', 'user'], 'a revoked row is not stamped again');
	});

	it('signs everyone out with the header when the family lookup fails after the write', async (t) => {
		const { base, change, grantSudo, store, faults } = await world(t);
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		faults.fail = (call) => (call.table === SESSIONS && call.method === 'GET' && call.params.get('select') === 'family_id' ? { status: 500 } : null);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.equal(answer.status, 204, answer.text);
		assert.equal(answer.headers.get('x-session-revoked'), 'all');
		assert.equal(store.rows('auth_session_cutoffs').length, 1);
	});

	it('signs everyone out with the header when the revoke PATCH fails after the write', async (t) => {
		const { base, change, grantSudo, store, faults } = await world(t);
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		faults.fail = (call) => (call.table === SESSIONS && call.method === 'PATCH' ? { status: 500 } : null);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.equal(answer.status, 204, answer.text);
		assert.equal(answer.headers.get('x-session-revoked'), 'all');
		assert.equal(store.rows('auth_session_cutoffs').length, 1);
	});

	it('answers 503 password_changed_signout_failed, saying the password changed, when the cut-off fails too', async (t) => {
		const { base, change, grantSudo, gotrue, faults } = await world(t);
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		faults.fail = (call) => ((call.table === SESSIONS && call.method === 'PATCH') || (call.table === 'auth_session_cutoffs' && call.method !== 'GET') ? { status: 500 } : null);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.deepEqual([answer.status, answer.body.code], [503, 'password_changed_signout_failed']);
		assert.match(answer.body.message, /HAS changed/);
		assert.equal(gotrue.puts.length, 1);
	});

	// devil D-P3-1b C11: a password change does NOT revoke personal access tokens. Deliberate.
	it('leaves a personal access token created before the change working', async (t) => {
		const { base, change, grantSudo, store } = await world(t);
		const { secret, row } = patRow({ userId: USER_A });
		store.rows('osionos_personal_access_tokens').push(row);
		const read = () => sendJson(base, `/api/pages/${USER_A}`, { headers: { authorization: `Bearer ${secret}` } });
		const before = await read();
		assert.notEqual(before.body.code, 'pat_invalid', 'the token is accepted by the gate before the change');
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		assert.equal((await change(caller.accessToken, { nextPassword: FAKE_PASSWORD })).status, 204);
		const after = await read();
		assert.deepEqual([after.status, after.body.code], [before.status, before.body.code]);
	});

	it('answers 503 account_plane_unavailable before any audit when the service key is not configured', async (t) => {
		// The account handler alone: the whole bridge copies its config, so this is the mount that sees the change.
		const kv = createTtlKv();
		const { base, config, store } = await startAccountWorld(t, { kv });
		const token = await sudoToken(config, kv);
		config.serviceKey = '';
		const answer = await send(base, PATH, { method: 'POST', token, body: { nextPassword: FAKE_PASSWORD } });
		assert.deepEqual([answer.status, answer.body.code], [503, 'account_plane_unavailable']);
		assert.equal(store.calls.length, 0);
	});

	it('cuts every session off and says so when the session records are off', async (t) => {
		const { base, change, grantSudo, store } = await world(t, { records: 'off' });
		const caller = await signIn(base);
		await grantSudo(caller.claims);
		const answer = await change(caller.accessToken, { nextPassword: FAKE_PASSWORD });
		assert.equal(answer.status, 204, answer.text);
		assert.equal(answer.headers.get('x-session-revoked'), 'all');
		assert.equal(store.rows('auth_session_cutoffs').filter((row) => lower(row.user_id) === USER_A).length, 1);
	});
});

describe('POST /api/account/password: the rate limit', () => {
	it('counts every attempt of the user before the sudo check, so the sixth is refused with 429', async (t) => {
		const { base, change, gotrue } = await world(t, { kv: kvStub() });
		const caller = await signIn(base);
		const answers = [];
		for (let attempt = 0; attempt < 6; attempt += 1) answers.push((await change(caller.accessToken, { nextPassword: FAKE_PASSWORD })).status);
		assert.deepEqual(answers, [403, 403, 403, 403, 403, 429]);
		assert.equal((await change(caller.accessToken, { nextPassword: FAKE_PASSWORD })).headers.get('retry-after'), '3600');
		assert.equal(gotrue.puts.length, 0);
	});
});
