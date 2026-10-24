/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET /api/account/emails through the real account handler, against a two-user fake of
 * GoTrue's admin read: the id asked for is the token's, the answer is the allowlisted
 * record, and every outage is settings_read_failed. The write verbs stay unserved.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../scripts/bridge-account-mounts.mjs';
import { accountConfig, sessionToken, USER_A, USER_B } from './support/account-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { callRoute } from './support/route-call.mjs';

const PATH = '/api/account/emails';
const OUTAGE = /_unavailable$|_off$/;
const LEAKS = { identities: [{ identity_data: 'LEAK-1' }], encrypted_password: 'LEAK-2', phone: 'LEAK-3', app_metadata: { k: 'LEAK-4' }, user_metadata: 'LEAK-5' };

const users = {
	[USER_A]: { id: USER_A, email: 'a@example.com', email_confirmed_at: '2026-09-02T00:00:00Z', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...LEAKS },
	[USER_B]: { id: USER_B, email: 'b-other@example.com', email_confirmed_at: '2026-09-03T00:00:00Z', created_at: '2026-09-01T00:00:00Z', ...LEAKS },
};

function build({ gotrue = (id) => ({ status: 200, body: users[id] }), kv = kvStub(), config = accountConfig() } = {}) {
	const upstream = [];
	const mfaFetch = async (url, init) => {
		upstream.push({ url: String(url), init });
		const id = decodeURIComponent(String(url).split('/').pop());
		const answer = gotrue(id);
		if (answer instanceof Error) throw answer;
		return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
	};
	const pg = { asUser: () => { throw new Error('pg must not be called'); }, asService: () => { throw new Error('pg must not be called'); } };
	const handler = createAccountHandler({ config, pg, kv, verifySession: verifyAppSessionToken, mfaEnv: {}, mfaFetch });
	const call = (userId, options) => callRoute(handler, { path: PATH, method: 'GET', ...options, headers: { authorization: `Bearer ${sessionToken(config, userId)}` } });
	return { upstream, call };
}

describe('GET /api/account/emails', () => {
	it('B8 asks GoTrue for the token user and answers exactly the primary record', async () => {
		const { call, upstream } = build();
		const result = await call(USER_A);
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, [{ _id: `primary-${USER_A}`, userId: USER_A, email: 'a@example.com', isPrimary: true, verifiedAt: '2026-09-02T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', removedAt: null }]);
		assert.doesNotMatch(result.text, /LEAK|identities|encrypted_password|phone|app_metadata|b-other/);
		assert.equal(upstream.length, 1);
		assert.ok(upstream[0].url.endsWith(`/auth/v1/admin/users/${USER_A}`));
		const other = await call(USER_B, { path: `${PATH}?userId=${USER_A}` });
		assert.equal(other.body[0].email, 'b-other@example.com');
		assert.ok(upstream[1].url.endsWith(`/auth/v1/admin/users/${USER_B}`));
	});

	it('B8 answers verifiedAt null when GoTrue states no confirmation, and updatedAt falls back to createdAt', async () => {
		const { call } = build({ gotrue: () => ({ status: 200, body: { email: 'a@example.com', created_at: '2026-09-01T00:00:00Z' } }) });
		const [record] = (await call(USER_A)).body;
		assert.deepEqual([record.verifiedAt, record.updatedAt], [null, '2026-09-01T00:00:00Z']);
	});

	it('B8 answers [] for a missing user or a payload without a string address', async () => {
		for (const gotrue of [() => ({ status: 404, body: {} }), () => ({ status: 200, body: { email: 42 } }), () => ({ status: 200, body: {} })]) {
			const result = await build({ gotrue }).call(USER_A);
			assert.deepEqual([result.status, result.body], [200, []]);
		}
	});

	it('B8 answers settings_read_failed when GoTrue fails, throws or is unconfigured', async () => {
		const cases = [build({ gotrue: () => ({ status: 500, body: {} }) }), build({ gotrue: () => new Error('refused') }), build({ config: { ...accountConfig(), serviceKey: '' } })];
		for (const { call, upstream } of cases) {
			const result = await call(USER_A);
			assert.deepEqual([result.status, result.body.code], [503, 'settings_read_failed']);
			assert.doesNotMatch(result.body.code, OUTAGE);
			assert.ok(upstream.length <= 1);
		}
	});
});

describe('unserved verbs and paths', () => {
	it('B9 answers 405 to POST and 404 not_found to a sub-path, without a GoTrue call', async () => {
		const { call, upstream } = build();
		assert.equal((await call(USER_A, { method: 'POST', body: { email: 'x@example.com' } })).status, 405);
		for (const [method, path] of [['DELETE', `${PATH}/primary-${USER_A}`], ['POST', `${PATH}/primary-${USER_A}/make-primary`], ['GET', `${PATH}/x`]]) {
			const result = await call(USER_A, { method, path });
			assert.deepEqual([result.status, result.body.code], [404, 'not_found'], `${method} ${path}`);
		}
		assert.equal(upstream.length, 0);
	});
});

describe('rate limit and kv', () => {
	it('B11 fails closed with settings_read_failed when the kv is down', async () => {
		const kv = kvStub();
		kv.incrWithTtl = async () => { throw Object.assign(new Error('down'), { status: 503, code: 'kv_unavailable' }); };
		const { call, upstream } = build({ kv });
		const result = await call(USER_A);
		assert.deepEqual([result.status, result.body.code, upstream.length], [503, 'settings_read_failed', 0]);
	});

	it('B11 answers 429 rate_limited with retry-after past 30 calls', async () => {
		const kv = kvStub();
		kv.incrWithTtl = async () => 31;
		const result = await build({ kv }).call(USER_A);
		assert.deepEqual([result.status, result.body.code, result.headers['retry-after']], [429, 'rate_limited', '60']);
	});
});

describe('the fly image', () => {
	it('B10 copies the three new modules by name', () => {
		const dockerfile = readFileSync(new URL('../../deploy/bridge-fly/Dockerfile', import.meta.url), 'utf8');
		for (const name of ['bridge-account-settings.mjs', 'bridge-account-emails.mjs', 'bridge-gotrue-user.mjs']) assert.ok(dockerfile.includes(`scripts/${name}`), name);
	});
});
