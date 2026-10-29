/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-gotrue-user.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * findAccountByEmail against a GoTrue admin-list fake: the exact match among containing
 * accounts, the confirmation flag, the full-page rule and the failure shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createHmac } from 'node:crypto';
import { endGotrueSessions, findAccountByEmail, readGotrueUser } from '../../scripts/bridge-gotrue-user.mjs';

const config = { baasUrl: 'http://grobase.test', serviceKey: 'service' };
const user = (email, extra = {}) => ({ id: `id-${email}`, email, email_confirmed_at: '2026-10-01T00:00:00Z', ...extra });
const listing = (users, { status = 200, urls = [] } = {}) => async (url) => {
	urls.push(String(url));
	return new Response(JSON.stringify({ users }), { status, headers: { 'content-type': 'application/json' } });
};
const find = (fetchImpl, address, options) => findAccountByEmail({ config, fetchImpl }, address, options);

describe('findAccountByEmail', () => {
	it('G1 keeps only the exact case-insensitive match and asks for per_page', async () => {
		const urls = [];
		const result = await find(listing([user('xdylan@gmail.com'), user('Dylan@Gmail.com'), user('dylan@gmail.com.au')], { urls }), ' dylan@gmail.com ');
		assert.deepEqual(result, { account: { id: 'id-Dylan@Gmail.com', emailConfirmed: true }, complete: true });
		assert.match(urls[0], /\/auth\/v1\/admin\/users\?filter=dylan%40gmail\.com&per_page=50$/);
		assert.deepEqual(await find(listing([user('xdylan@gmail.com')]), 'dylan@gmail.com'), { account: null, complete: true });
	});

	it('G2 reads emailConfirmed from email_confirmed_at', async () => {
		for (const [value, confirmed] of [['2026-10-01T00:00:00Z', true], [null, false], ['', false], [undefined, false]]) {
			const { account } = await find(listing([user('a@b.co', { email_confirmed_at: value })]), 'a@b.co');
			assert.equal(account.emailConfirmed, confirmed, String(value));
		}
	});

	it('G3 a full page with no exact match is incomplete, never absent', async () => {
		const page = Array.from({ length: 50 }, (_, index) => user(`x${index}a@b.co`));
		assert.deepEqual(await find(listing(page), 'a@b.co'), { account: null, complete: false });
		const hit = await find(listing([...page.slice(1), user('a@b.co')]), 'a@b.co');
		assert.equal(hit.account.id, 'id-a@b.co', 'a match on a full page decides');
		assert.deepEqual(await find(listing(page.slice(0, 3)), 'a@b.co', { perPage: 3 }), { account: null, complete: false });
	});

	it('G4 any failure is gotrue_lookup_failed, and readGotrueUser keeps its own code', async () => {
		const cases = {
			'non-2xx': listing([], { status: 500 }),
			'network': async () => { throw new Error('down'); },
			'bad body': async () => new Response('not json', { status: 200 }),
		};
		for (const [name, fetchImpl] of Object.entries(cases)) {
			const error = await find(fetchImpl, 'a@b.co').catch((e) => e);
			assert.deepEqual([error.status, error.code], [503, 'gotrue_lookup_failed'], name);
		}
		assert.equal((await findAccountByEmail({ config: {}, fetchImpl: listing([]) }, 'a@b.co').catch((e) => e)).code, 'gotrue_lookup_failed');
		assert.equal((await readGotrueUser({ config, fetchImpl: listing([], { status: 404 }) }, 'u').catch((e) => e)).code, 'gotrue_read_failed');
	});
});

const SECRET = 'logout-test-secret';
const UID = 'AAAAAAAA-1111-4111-8111-AAAAAAAAAAAA';
const DEPS = { config, env: { JWT_SECRET: SECRET } };
const answer = (status, body) => async () => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status });
const logout = (fetchImpl, overrides = {}, userId = UID) => endGotrueSessions({ ...DEPS, ...overrides, fetchImpl }, userId);
const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

describe('endGotrueSessions', () => {
	it('L1 posts scope=global with a 60 s HS256 token of exactly sub, role, aud, iat, exp', async () => {
		const calls = [];
		await logout(async (url, init) => { calls.push([String(url), init]); return new Response(null, { status: 204 }); });
		const [[url, init]] = calls;
		assert.equal(url, 'http://grobase.test/auth/v1/logout?scope=global');
		assert.deepEqual([init.method, init.headers.apikey, init.body], ['POST', 'service', undefined]);
		const token = init.headers.Authorization.replace(/^Bearer /, '');
		const [header, body, signature] = token.split('.');
		assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
		assert.equal(signature, createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url'));
		const claims = claimsOf(token);
		assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'role', 'sub']);
		assert.deepEqual([claims.sub, claims.role, claims.aud, claims.exp - claims.iat], [UID.toLowerCase(), 'authenticated', 'authenticated', 60]);
	});

	it('L2 resolves on 204 and 200', async () => {
		for (const status of [204, 200]) assert.equal(await logout(answer(status, status === 200 ? {} : undefined)), undefined, String(status));
	});

	it('L3 resolves on a 403 user_not_found in either field, throws on any other 403', async () => {
		await logout(answer(403, { error_code: 'user_not_found' }));
		await logout(answer(403, { code: 'user_not_found' }));
		for (const body of [{ error_code: 'session_not_found' }, 'not json', {}]) {
			assert.equal((await logout(answer(403, body)).catch((e) => e)).code, 'gotrue_signout_failed');
		}
	});

	const FAILURES = {
		'401': [answer(401, {}), 401],
		'500': [answer(500, {}), 500],
		'non-json 502': [answer(502, '<html>'), 502],
		'network': [async () => { throw new Error('down'); }, null],
		'timeout': [async () => { throw new DOMException('timed out', 'TimeoutError'); }, null],
	};
	const REFUSED = {
		'blank secret': [{ env: { JWT_SECRET: '  ' } }, UID],
		'missing secret': [{ env: {} }, UID],
		'no baasUrl': [{ config: { serviceKey: 'service' } }, UID],
		'no serviceKey': [{ config: { baasUrl: config.baasUrl } }, UID],
		'non-uuid user': [{}, 'not-a-uuid'],
	};

	it('L4 every other failure is gotrue_signout_failed with its upstreamStatus', async () => {
		for (const [name, [fetchImpl, upstreamStatus]] of Object.entries(FAILURES)) {
			const error = await logout(fetchImpl).catch((e) => e);
			assert.deepEqual([error.status, error.code, error.upstreamStatus], [503, 'gotrue_signout_failed', upstreamStatus], name);
		}
	});

	it('L5 a missing secret, url or key and a non-uuid user throw before any fetch', async () => {
		for (const [name, [overrides, userId]] of Object.entries(REFUSED)) {
			let calls = 0;
			const error = await logout(async () => { calls += 1; return new Response(null, { status: 204 }); }, overrides, userId).catch((e) => e);
			assert.deepEqual([error.code, error.status, calls], ['gotrue_signout_failed', 503, 0], name);
		}
	});

	it('L6 no failure leaks the minted token or the secret', async () => {
		let minted = '';
		const spy = (inner) => async (url, init) => { minted = init.headers.Authorization.replace(/^Bearer /, ''); return inner(url, init); };
		const cases = [...Object.values(FAILURES).map(([fetchImpl]) => spy(fetchImpl)), spy(answer(403, {}))];
		for (const fetchImpl of cases) {
			const error = await logout(fetchImpl).catch((e) => e);
			for (const text of [JSON.stringify(error), inspect(error, { depth: 5 }), error.message]) {
				assert.equal(text.includes(minted) || text.includes(SECRET), false);
			}
		}
		const refused = await logout(answer(204), { env: { JWT_SECRET: SECRET }, config: {} }).catch((e) => e);
		assert.equal(inspect(refused, { depth: 5 }).includes(SECRET), false);
	});
});
