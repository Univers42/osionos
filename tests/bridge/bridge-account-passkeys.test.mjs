/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-passkeys.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Passkey management (P3-2-c): list, rename, remove. The routes are exercised without a
 * socket against a recording fake of the service-role Postgres client, so each test can read
 * the exact filter a request produced: every read and write must carry (user_id, tenant_id).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPasskeyRoutes } from '../../scripts/bridge-account-passkeys.mjs';
import { callRoute } from './support/route-call.mjs';
import { accountConfig, USER_A } from './support/account-world.mjs';

const TENANT = 'tenant-acme';
const ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const ROW = { id: ID, user_id: USER_A, name: 'Laptop', transports: 'internal,hybrid', created_at: '2026-10-01T00:00:00Z', last_used_at: null, public_key: 'SECRET', credential_id: 'SECRET' };

/** A pg double that records calls and answers each verb from `answers`. */
function fakePg(answers = {}) {
	const calls = [];
	const verb = (name) => async (path, ...rest) => {
		calls.push({ name, path, rest });
		const answer = answers[name];
		if (answer instanceof Error) throw answer;
		return typeof answer === 'function' ? answer(path) : (answer ?? []);
	};
	const service = { get: verb('get'), patch: verb('patch'), del: verb('del'), post: verb('post') };
	return { calls, asService: () => service };
}

function build({ env = { PASSKEYS_ENABLED: '1' }, answers, tenant = TENANT, verifySession } = {}) {
	const pg = fakePg(answers);
	const config = { ...accountConfig(), baasTenantId: tenant };
	const session = { userId: USER_A, jti: 'jti-1', aal: 2 };
	const handler = createPasskeyRoutes({ config, pg, verifySession: verifySession ?? (() => session), env });
	// The audit row goes through pg.post; count the real writes separately.
	const writes = () => pg.calls.filter((call) => call.name !== 'post');
	return { pg, handler, writes, call: (options) => callRoute(handler, options) };
}

const query = (path) => new URLSearchParams(path.split('?')[1]);

describe('passkey routes: disabled', () => {
	const cases = [['GET', '/api/account/passkeys'], ['PATCH', `/api/account/passkeys/${ID}`], ['DELETE', `/api/account/passkeys/${ID}`]];
	for (const [method, path] of cases) {
		it(`${method} answers 404 before any pg call when PASSKEYS_ENABLED is not 1`, async () => {
			for (const env of [{}, { PASSKEYS_ENABLED: '0' }, { PASSKEYS_ENABLED: 'true' }]) {
				const { pg, call } = build({ env });
				const result = await call({ method, path, body: { nickname: 'x' } });
				assert.equal(result.status, 404);
				assert.equal(result.body.code, 'passkeys_disabled');
				assert.equal(pg.calls.length, 0);
			}
		});
	}

	it('leaves unrelated paths and verbs to the other modules', async () => {
		const { call } = build();
		assert.equal((await call({ method: 'POST', path: '/api/account/passkeys' })).handled, false);
		assert.equal((await call({ method: 'GET', path: '/api/account/passkeys/' + ID })).handled, false);
		assert.equal((await call({ method: 'PATCH', path: '/api/account/passkeys' })).handled, false);
		assert.equal((await call({ method: 'GET', path: '/api/account/other' })).handled, false);
	});
});

describe('passkey routes: aal2 and ids', () => {
	it('refuses an aal1 session (the shared verifier throws mfa_required)', async () => {
		const refuse = () => { throw Object.assign(new Error('Two-step verification is required.'), { status: 403, code: 'mfa_required' }); };
		const { pg, call } = build({ verifySession: refuse });
		for (const [method, path] of [['GET', '/api/account/passkeys'], ['PATCH', `/api/account/passkeys/${ID}`], ['DELETE', `/api/account/passkeys/${ID}`]]) {
			const result = await call({ method, path, body: { nickname: 'x' } });
			assert.equal(result.status, 403);
			assert.equal(result.body.code, 'mfa_required');
		}
		assert.equal(pg.calls.length, 0);
	});

	it('answers 404 to an id that is not a uuid, without touching pg', async () => {
		const { pg, call } = build();
		const result = await call({ method: 'DELETE', path: '/api/account/passkeys/not-a-uuid' });
		assert.equal(result.status, 404);
		assert.equal(pg.calls.length, 0);
	});
});

describe('passkey routes: list', () => {
	it('filters on user and tenant, selects no secret column and maps the rows', async () => {
		const { writes, call } = build({ answers: { get: [ROW] } });
		const result = await call({ method: 'GET', path: '/api/account/passkeys' });
		assert.equal(result.status, 200);
		const [read] = writes();
		const params = query(read.path);
		assert.equal(params.get('user_id'), `eq.${USER_A}`);
		assert.equal(params.get('tenant_id'), `eq.${TENANT}`);
		assert.doesNotMatch(params.get('select'), /public_key|credential_id|sign_count/);
		assert.deepEqual(result.body, [{ _id: ID, userId: USER_A, transports: ['internal', 'hybrid'], nickname: 'Laptop', createdAt: ROW.created_at, updatedAt: ROW.created_at, lastUsedAt: null, removedAt: null }]);
		assert.doesNotMatch(result.text, /SECRET/);
	});

	it('uses an empty tenant when none is configured', async () => {
		const { writes, call } = build({ tenant: '', answers: { get: [] } });
		await call({ method: 'GET', path: '/api/account/passkeys' });
		assert.equal(query(writes()[0].path).get('tenant_id'), 'eq.');
	});

	it('answers 503 passkeys_unavailable when pg fails', async () => {
		const { call } = build({ answers: { get: new Error('db down') } });
		const result = await call({ method: 'GET', path: '/api/account/passkeys' });
		assert.equal(result.status, 503);
		assert.equal(result.body.code, 'passkeys_unavailable');
	});
});

describe('passkey routes: rename', () => {
	it('PATCHes the name under the user, tenant and id filter and audits it first', async () => {
		const { pg, writes, call } = build({ answers: { patch: [{ ...ROW, name: 'Phone' }] } });
		const result = await call({ method: 'PATCH', path: `/api/account/passkeys/${ID}`, body: { nickname: '  Phone  ' } });
		assert.equal(result.status, 200);
		assert.equal(result.body.nickname, 'Phone');
		const [patch] = writes();
		const params = query(patch.path);
		assert.equal(params.get('user_id'), `eq.${USER_A}`);
		assert.equal(params.get('tenant_id'), `eq.${TENANT}`);
		assert.equal(params.get('id'), `eq.${ID}`);
		assert.deepEqual(patch.rest[0], { name: 'Phone' });
		const order = pg.calls.map((entry) => entry.name);
		assert.ok(order.indexOf('post') < order.indexOf('patch'), `audit must precede the write: ${order}`);
		assert.equal(pg.calls[0].rest[0].event_type, 'account.passkey.rename');
	});

	it('answers 404 when no row matched (another user or tenant)', async () => {
		const { call } = build({ answers: { patch: [] } });
		const result = await call({ method: 'PATCH', path: `/api/account/passkeys/${ID}`, body: { nickname: 'Phone' } });
		assert.equal(result.status, 404);
		assert.equal(result.body.code, 'passkey_not_found');
	});

	const bad = [['empty', ''], ['blank', '   '], ['too long', 'x'.repeat(65)], ['control character', 'a\u0007b'], ['not a string', 7]];
	for (const [label, nickname] of bad) {
		it(`answers 422 invalid_nickname for ${label}, before any write`, async () => {
			const { writes, call } = build();
			const result = await call({ method: 'PATCH', path: `/api/account/passkeys/${ID}`, body: { nickname } });
			assert.equal(result.status, 422);
			assert.equal(result.body.code, 'invalid_nickname');
			assert.equal(writes().length, 0);
		});
	}
});

describe('passkey routes: remove', () => {
	it('DELETEs under the user, tenant and id filter and audits it first', async () => {
		const { pg, writes, call } = build({ answers: { del: [{ id: ID }] } });
		const result = await call({ method: 'DELETE', path: `/api/account/passkeys/${ID}` });
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { ok: true });
		const params = query(writes()[0].path);
		assert.equal(params.get('user_id'), `eq.${USER_A}`);
		assert.equal(params.get('tenant_id'), `eq.${TENANT}`);
		assert.equal(params.get('id'), `eq.${ID}`);
		assert.equal(pg.calls[0].rest[0].event_type, 'account.passkey.remove');
	});

	it('answers 404 when nothing was deleted', async () => {
		const { call } = build({ answers: { del: [] } });
		assert.equal((await call({ method: 'DELETE', path: `/api/account/passkeys/${ID}` })).status, 404);
	});

	it('answers 503 when the delete fails', async () => {
		const { call } = build({ answers: { del: new Error('db down') } });
		assert.equal((await call({ method: 'DELETE', path: `/api/account/passkeys/${ID}` })).status, 503);
	});
});
