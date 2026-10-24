/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-settings.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET and PATCH /api/account/settings through the real account handler: the summary of the
 * caller only, the PATCH allowlist, the outage code, and the kv-down fail-closed rule. The
 * PostgREST fake records the role of every request, so a read that used the service role
 * (which sees every user's rows) shows up as a recorded `_service` call.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../scripts/bridge-account-mounts.mjs';
import { signAppSessionToken } from '../../scripts/bridge-session-token.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import { accountConfig, ACCOUNT_JWT_SECRET, sessionToken, USER_A, USER_B } from './support/account-world.mjs';
import { createAccountStore } from './support/account-postgrest.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { callRoute } from './support/route-call.mjs';

const PATH = '/api/account/settings';
const MERGE = 'rpc/osionos_user_settings_merge';
const SETTINGS = 'osionos_user_settings';
const OUTAGE = /_unavailable$|_off$/;

const row = (userId, value, updated_at = '2026-10-20T10:00:00.000Z') => ({ user_id: userId, section: 'security', value, version: 1, updated_at });

function build({ rows = [], flag = undefined, kv = kvStub(), fail = null } = {}) {
	const config = accountConfig();
	const store = createAccountStore({ settings: rows, fail });
	const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
	const handler = createAccountHandler({ config, pg, kv, verifySession: verifyAppSessionToken, mfaEnv: { PASSKEYS_ENABLED: flag }, mfaFetch: async () => { throw new Error('GoTrue must not be called'); } });
	const call = (userId, options) => callRoute(handler, { ...options, headers: { authorization: `Bearer ${sessionToken(config, userId)}`, ...options.headers } });
	const roles = () => store.calls.map((entry) => (entry.claims?._service ? '_service' : entry.claims?.role));
	return { config, store, kv, call, roles, get: (userId = USER_A, options = {}) => call(userId, { method: 'GET', path: PATH, ...options }), patch: (body, userId = USER_A) => call(userId, { method: 'PATCH', path: PATH, body }) };
}

describe('GET /api/account/settings', () => {
	it('B1 answers the flag alone when no row exists, with no guessed sign-in field', async () => {
		const { get } = build();
		const result = await get();
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { userId: USER_A, security: { passkeysEnabled: false } });
		assert.doesNotMatch(result.text, /hasPassword|passwordUpdatedAt|pendingDeletionAt/);
	});

	it('B2 reports the stored method with the row date, and the flag only for "1"', async () => {
		const { get } = build({ rows: [row(USER_A, { preferredMfaMethod: 'recovery' })], flag: '1' });
		assert.deepEqual((await get()).body, { userId: USER_A, security: { passkeysEnabled: true, preferredMfaMethod: 'recovery' }, updatedAt: '2026-10-20T10:00:00.000Z' });
		for (const flag of ['true', '0', '']) assert.equal((await build({ flag }).get()).body.security.passkeysEnabled, false, `flag ${flag}`);
		const sms = build({ rows: [row(USER_A, { preferredMfaMethod: 'sms' })] });
		assert.deepEqual((await sms.get()).body.security, { passkeysEnabled: false });
	});

	it('B3 serves each user only their own row, whatever the query or header says', async () => {
		const { get, roles } = build({ rows: [row(USER_A, { preferredMfaMethod: 'totp' }), row(USER_B, { preferredMfaMethod: 'recovery' })] });
		assert.equal((await get(USER_A)).body.security.preferredMfaMethod, 'totp');
		assert.equal((await get(USER_B)).body.security.preferredMfaMethod, 'recovery');
		const spoof = await get(USER_A, { path: `${PATH}?userId=${USER_B}&user_id=${USER_B}`, headers: { 'x-user-id': USER_B } });
		assert.deepEqual([spoof.body.userId, spoof.body.security.preferredMfaMethod], [USER_A, 'totp']);
		assert.ok(!roles().includes('_service'));
	});
});

describe('PATCH /api/account/settings', () => {
	it('B4 writes through the merge function as the account role and GET agrees', async () => {
		const { patch, get, store, roles } = build({ rows: [row(USER_B, { preferredMfaMethod: 'totp' })] });
		const result = await patch({ security: { preferredMfaMethod: 'recovery' } });
		assert.equal(result.status, 200);
		assert.equal(result.body.security.preferredMfaMethod, 'recovery');
		const write = store.callsTo(MERGE)[0];
		assert.deepEqual([write.claims.aud, write.claims.role, write.claims.sub], ['osionos-account', 'osionos_account_user', USER_A]);
		assert.deepEqual(write.body, { p_section: 'security', p_patch: { preferredMfaMethod: 'recovery' } });
		assert.equal((await get()).body.security.preferredMfaMethod, 'recovery');
		assert.equal((await get(USER_B)).body.security.preferredMfaMethod, 'totp');
		assert.ok(!roles().includes('_service'));
	});

	it('B4 keeps both of two parallel writes', async () => {
		const { patch, store } = build();
		const answers = await Promise.all([patch({ security: { preferredMfaMethod: 'totp' } }), patch({ security: { preferredMfaMethod: 'recovery' } })]);
		assert.deepEqual(answers.map((answer) => answer.status), [200, 200]);
		assert.equal(store.callsTo(MERGE).length, 2);
	});

	const refused = [
		['hasPassword', { security: { hasPassword: true } }],
		['passkeysEnabled', { security: { passkeysEnabled: true } }],
		['passwordUpdatedAt', { security: { passwordUpdatedAt: 'x' } }],
		['pendingDeletionAt', { security: { pendingDeletionAt: null } }],
		['userId', { security: { userId: USER_B } }],
		['a top-level unknown key', { other: 1 }],
		['security as an array', { security: [] }],
		['an unknown method', { security: { preferredMfaMethod: 'sms-SECRET' } }],
		['a full default object', { userId: USER_A, security: { preferredMfaMethod: 'totp' }, supportAccessGrantedUntil: null, pendingDeletionAt: null, removedAt: null }],
		['a mixed valid and invalid body', { security: { preferredMfaMethod: 'totp', hasPassword: true } }],
		['a mixed top level', { security: { preferredMfaMethod: 'totp' }, extra: 1 }],
		['a non-object body', [1]],
		['__proto__', '{"security":{"__proto__":{"x":1}}}'],
		['constructor', '{"security":{"constructor":{}}}'],
		['a duplicate key whose last value is invalid', '{"security":{"preferredMfaMethod":"totp","preferredMfaMethod":"sms"}}'],
	];
	for (const [name, body] of refused) {
		it(`B5 refuses ${name} with 422 and no write`, async () => {
			const { patch, store } = build();
			const result = await patch(body);
			assert.equal(result.status, 422, result.text);
			assert.equal(result.body.code, 'invalid_body');
			assert.equal(store.callsTo(MERGE).length, 0);
			assert.doesNotMatch(result.text, /SECRET|aaaaaaaa|bbbbbbbb/);
		});
	}

	it('B5 answers empty_patch for {} and for an empty security', async () => {
		for (const body of [{}, { security: {} }]) {
			const { patch, store } = build();
			const result = await patch(body);
			assert.deepEqual([result.status, result.body.code, store.callsTo(MERGE).length], [422, 'empty_patch', 0]);
		}
	});
});

describe('verbs, session and rate limit', () => {
	it('B6 needs no sudo grant, refuses a pending-mfa token and no session', async () => {
		const { patch, config, call } = build();
		assert.equal((await patch({ security: { preferredMfaMethod: 'totp' } })).status, 200);
		const { token } = signAppSessionToken({ payload: { subject: USER_A, provider: 'prismatica' }, workspace: { _id: USER_A }, config, aal: 1, mfaReq: true });
		const pending = await call(USER_A, { method: 'GET', path: PATH, headers: { authorization: `Bearer ${token}` } });
		assert.deepEqual([pending.status, pending.body.code], [403, 'mfa_required']);
		const anonymous = await callRoute(createAccountHandler({ config, pg: null, kv: kvStub(), verifySession: verifyAppSessionToken }), { method: 'GET', path: PATH, headers: { authorization: '' } });
		assert.equal(anonymous.status, 401);
	});

	it('B6 answers 405 to PUT and DELETE before any call, and 404 not_found to a sub-path', async () => {
		const { call, store } = build();
		for (const method of ['PUT', 'DELETE', 'POST']) assert.equal((await call(USER_A, { method, path: PATH })).status, 405);
		const sub = await call(USER_A, { method: 'GET', path: `${PATH}/x` });
		assert.deepEqual([sub.status, sub.body.code], [404, 'not_found']);
		assert.equal(store.calls.length, 0);
	});

	it('B6 answers 429 with retry-after past the limit', async () => {
		const kv = kvStub();
		kv.incrWithTtl = async () => 121;
		const result = await build({ kv }).get();
		assert.deepEqual([result.status, result.body.code, result.headers['retry-after']], [429, 'rate_limited', '60']);
	});

	it('B6 limits the PATCH too', async () => {
		const kv = kvStub();
		kv.incrWithTtl = async () => 121;
		const { patch, store } = build({ kv });
		assert.equal((await patch({ security: { preferredMfaMethod: 'totp' } })).status, 429);
		assert.equal(store.calls.length, 0);
	});
});

describe('outages', () => {
	it('B7 answers settings_read_failed when the read or the write throws', async () => {
		const readDown = build({ fail: (entry) => (entry.table === SETTINGS ? { status: 500 } : null) });
		const writeDown = build({ fail: (entry) => (entry.table === MERGE ? { status: 500 } : null) });
		for (const result of [await readDown.get(), await writeDown.patch({ security: { preferredMfaMethod: 'totp' } })]) {
			assert.equal(result.status, 503);
			assert.equal(result.body.code, 'settings_read_failed');
			assert.doesNotMatch(result.body.code, OUTAGE);
			assert.deepEqual(Object.keys(result.body).sort(), ['code', 'message', 'ok']);
		}
	});

	it('B11 fails closed with settings_read_failed when the kv is down, touching nothing', async () => {
		const kv = kvStub();
		kv.incrWithTtl = async () => { throw Object.assign(new Error('down'), { status: 503, code: 'kv_unavailable' }); };
		const { get, patch, store } = build({ kv });
		for (const result of [await get(), await patch({ security: { preferredMfaMethod: 'totp' } })]) {
			assert.deepEqual([result.status, result.body.code], [503, 'settings_read_failed']);
		}
		assert.equal(store.calls.length, 0);
	});
});
