/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pg.test.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The account plane must never be reached with the service role on behalf of a user, and
// a PostgREST detail can quote another row, so these tests pin the exact JWT claims, the
// fixed error messages and the paging boundaries as much as the happy path.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ACCOUNT_DB_ROLE, ACCOUNT_JWT_AUDIENCE, ACCOUNT_JWT_TTL_SECONDS, createPg, mintAccountJwt } from '../../scripts/bridge-pg.mjs';
import { inFilter, keyset } from '../../scripts/bridge-paging.mjs';

const SECRET = 'account-jwt-test-secret';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_KEY = 'service-role-key-DO-NOT-LEAK';
const CONFIG = { baasUrl: 'http://baas:8000', publicApiKey: 'public-anon-key', serviceKey: SERVICE_KEY };
const ENV = { JWT_SECRET: SECRET };
const BASE = 'http://baas:8000/rest/v1';

// Exact shape returned by verifyAppSessionToken (bridge-api.mjs:486-492); importing
// bridge-api.mjs here would boot a server, so the object is built by hand.
const SESSION = {
	userId: USER_ID,
	workspaceIds: [WORKSPACE_ID],
	roles: { [WORKSPACE_ID]: 'owner' },
	isAdmin: false,
	raw: { iss: 'osionos-bridge', aud: 'osionos-app', sub: USER_ID, jti: SESSION_ID, iat: 1, exp: 2 },
};

const decodeJwt = (token) => {
	const [header, payload, signature] = token.split('.');
	return {
		header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
		payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
		signature,
		signingInput: `${header}.${payload}`,
	};
};

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const recorded = (answer) => {
	const calls = [];
	return {
		calls,
		fetchImpl: async (url, init = {}) => {
			calls.push({ url: String(url), init });
			return answer(url, init);
		},
	};
};

const pgFor = (fetchImpl, env = ENV) => createPg({ config: CONFIG, env, fetchImpl, now: () => 1_760_000_000_000 });
const predicate = (status, code) => (error) => error?.status === status && error?.code === code;
const authPayload = (init) => decodeJwt(init.headers.Authorization.slice('Bearer '.length)).payload;

describe('mintAccountJwt', () => {
	it('signs the exact account claims with HS256', () => {
		const token = mintAccountJwt({ userId: USER_ID, sessionId: SESSION_ID, secret: SECRET, nowMs: 1_760_000_000_123 });
		const { header, payload, signature, signingInput } = decodeJwt(token);
		assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' });
		assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'role', 'sid', 'sub']);
		assert.equal(payload.iss, 'supabase');
		assert.equal(payload.aud, ACCOUNT_JWT_AUDIENCE);
		assert.equal(payload.role, ACCOUNT_DB_ROLE);
		assert.equal(payload.sub, USER_ID);
		assert.equal(payload.sid, SESSION_ID);
		assert.equal(payload.iat, 1_760_000_000);
		assert.equal(payload.exp, payload.iat + ACCOUNT_JWT_TTL_SECONDS);
		assert.equal(createHmac('sha256', SECRET).update(signingInput).digest('base64url'), signature);
	});

	it('omits sid without a session id, honours a shorter ttl and lower-cases the subject', () => {
		const plain = decodeJwt(mintAccountJwt({ userId: USER_ID, secret: SECRET, nowMs: 1_760_000_000_000 })).payload;
		const short = decodeJwt(mintAccountJwt({ userId: USER_ID, secret: SECRET, nowMs: 1_760_000_000_000, ttlSeconds: 30 })).payload;
		const upper = decodeJwt(mintAccountJwt({ userId: 'ABCDEF01-2345-6789-ABCD-EF0123456789', secret: SECRET, nowMs: 1 })).payload;
		assert.equal('sid' in plain, false);
		assert.equal(plain.exp - plain.iat, 120);
		assert.equal(short.exp - short.iat, 30);
		assert.equal(upper.sub, 'abcdef01-2345-6789-abcd-ef0123456789');
	});

	it('refuses a blank secret and a non-uuid subject', () => {
		assert.throws(() => mintAccountJwt({ userId: USER_ID, secret: '', nowMs: 1 }), predicate(503, 'account_plane_unavailable'));
		assert.throws(() => mintAccountJwt({ userId: USER_ID, secret: '   ', nowMs: 1 }), predicate(503, 'account_plane_unavailable'));
		assert.throws(() => mintAccountJwt({ userId: 'admin', secret: SECRET, nowMs: 1 }), predicate(400, 'invalid_subject'));
	});
});

describe('createPg asUser', () => {
	it('mints a per-user JWT with the session jti and never leaks the service key', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		await pgFor(fetchImpl).asUser(SESSION).get('osionos_profiles?select=*');
		assert.equal(calls.length, 1);
		const [{ url, init }] = calls;
		assert.equal(url, `${BASE}/osionos_profiles?select=*`);
		assert.equal(init.headers.apikey, CONFIG.publicApiKey);
		const payload = authPayload(init);
		assert.equal(payload.sub, USER_ID);
		assert.equal(payload.sid, SESSION_ID);
		assert.equal(payload.role, ACCOUNT_DB_ROLE);
		assert.equal(JSON.stringify({ url, headers: init.headers, body: init.body }).includes(SERVICE_KEY), false);
	});

	it('drops a non-uuid session jti and omits apikey without a public key', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		const session = { ...SESSION, raw: { ...SESSION.raw, jti: 'legacy-session-id' } };
		const pg = createPg({ config: { ...CONFIG, publicApiKey: '' }, env: ENV, fetchImpl });
		await pg.asUser(session).get('osionos_profiles');
		assert.equal('sid' in authPayload(calls[0].init), false);
		assert.equal('apikey' in calls[0].init.headers, false);
	});

	it('refuses a blank secret instead of falling back to the service role', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		await assert.rejects(pgFor(fetchImpl, {}).asUser(SESSION).get('osionos_profiles'), predicate(503, 'account_plane_unavailable'));
		assert.equal(calls.length, 0);
	});
});

describe('createPg asService', () => {
	it('uses the service key in both headers', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		await pgFor(fetchImpl).asService().get('osionos_profiles');
		assert.equal(calls[0].init.headers.apikey, SERVICE_KEY);
		assert.equal(calls[0].init.headers.Authorization, `Bearer ${SERVICE_KEY}`);
	});

	it('refuses an empty service key', () => {
		const { fetchImpl } = recorded(() => jsonResponse(200, []));
		assert.throws(() => createPg({ config: { ...CONFIG, serviceKey: '' }, env: ENV, fetchImpl }).asService(), predicate(503, 'baas_unconfigured'));
	});

	it('honours OSIONOS_POSTGREST_URL and trims its trailing slash', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		const pg = pgFor(fetchImpl, { ...ENV, OSIONOS_POSTGREST_URL: 'http://postgrest:3000/custom/' });
		await pg.asService().get('osionos_profiles');
		assert.equal(calls[0].url, 'http://postgrest:3000/custom/osionos_profiles');
	});

	it('lets encoded filter values and keyset cursors through the query string', async () => {
		const values = ['AC/DC', 'c\\d', 'x..y', 'https://e.x'];
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		const pg = pgFor(fetchImpl);
		await pg.asService().get(`t?${inFilter('name', values)}`);
		const decoded = new URL(calls[0].url).searchParams.get('name').slice('in.('.length, -1).split(',');
		assert.deepEqual(decoded.map((value) => value.slice(1, -1).replace(/\\(["\\])/g, '$1')), values);
		await pg.asService().get(`t?${keyset({ order: [['name', 'asc']], cursor: ['AC/DC'], limit: 5 }).query}`);
		assert.equal(calls.length, 2);
		assert.equal(new URL(calls[1].url).searchParams.get('or'), '(name.gt."AC/DC")');
	});

	it('rejects a missing base with baas_unconfigured before fetch', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		const pg = createPg({ config: { ...CONFIG, baasUrl: '' }, env: ENV, fetchImpl });
		await assert.rejects(pg.asService().get('x'), predicate(503, 'baas_unconfigured'));
		await assert.rejects(pg.asUser(SESSION).get('x'), predicate(503, 'baas_unconfigured'));
		assert.equal(calls.length, 0);
	});
});

describe('postgrest status mapping', () => {
	const matrix = {
		service: [[400, 422, 'invalid_request'], [401, 403, 'forbidden'], [403, 403, 'forbidden'], [404, 404, 'not_found'], [409, 409, 'conflict'], [429, 429, 'rate_limited'], [500, 502, 'baas_failed']],
		user: [[400, 422, 'invalid_request'], [401, 503, 'account_plane_unavailable'], [403, 503, 'account_plane_unavailable'], [404, 503, 'account_plane_unavailable'], [409, 409, 'conflict'], [429, 429, 'rate_limited'], [500, 502, 'baas_failed']],
	};
	for (const [kind, rows] of Object.entries(matrix)) {
		it(`${kind} maps every upstream status`, async () => {
			for (const [upstream, status, code] of rows) {
				const marker = `UPSTREAM-MARKER-${upstream}`;
				const { fetchImpl } = recorded(() => jsonResponse(upstream, { code: '42501', message: marker }));
				const pg = pgFor(fetchImpl);
				const client = kind === 'user' ? pg.asUser(SESSION) : pg.asService();
				await assert.rejects(client.get('osionos_profiles'), (error) => {
					assert.equal(error.status, status, `status for ${upstream}`);
					assert.equal(error.code, code, `code for ${upstream}`);
					assert.equal(error.upstreamStatus, upstream);
					assert.equal(error.upstreamCode, '42501');
					assert.ok(error.upstreamText.includes(marker));
					assert.equal(error.message.includes(marker), false);
					return true;
				});
			}
		});
	}

	it('leaves upstreamCode undefined for a non-JSON body', async () => {
		const { fetchImpl } = recorded(() => new Response('BOOM-MARKER', { status: 500 }));
		await assert.rejects(pgFor(fetchImpl).asService().get('osionos_profiles'), (error) => {
			assert.equal(error.code, 'baas_failed');
			assert.equal(error.upstreamCode, undefined);
			assert.equal(error.message.includes('BOOM-MARKER'), false);
			return true;
		});
	});

	it('maps a network failure to baas_unreachable', async () => {
		const fetchImpl = async () => {
			throw new Error('ECONNREFUSED');
		};
		await assert.rejects(pgFor(fetchImpl).asService().get('osionos_profiles'), predicate(503, 'baas_unreachable'));
	});

	it('maps a timeout to baas_unreachable', async () => {
		const fetchImpl = (url, init) => new Promise((resolve, reject) => {
			// The fallback timer keeps the loop alive long enough for the unref'd timeout signal.
			const fallback = setTimeout(() => reject(new Error('not aborted')), 200);
			init.signal.addEventListener('abort', () => {
				clearTimeout(fallback);
				reject(new Error('aborted'));
			});
		});
		const pg = createPg({ config: CONFIG, env: ENV, fetchImpl, timeoutMs: 5 });
		await assert.rejects(pg.asService().get('osionos_profiles'), predicate(503, 'baas_unreachable'));
	});
});

describe('path guard', () => {
	const unsafe = ['/x', 'a/../b', 'http://x', 'a\nb', 'a\\b', '%2E%2e/%2e%2e/auth/v1/admin/users', 'x/%2F..', '%5c', '%2e%2e/x?y=1', 'a/../b?c=d'];
	for (const path of unsafe) {
		it(`rejects ${JSON.stringify(path)} without calling fetch`, async () => {
			const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
			await assert.rejects(pgFor(fetchImpl).asService().get(path), TypeError);
			assert.equal(calls.length, 0);
		});
	}

	it('rejects a bad path before minting, even with a blank secret', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		await assert.rejects(pgFor(fetchImpl, {}).asUser(SESSION).get('a/../b'), TypeError);
		assert.equal(calls.length, 0);
	});

	it('guards the rpc name and sends a valid rpc under the rpc route', async () => {
		const { calls, fetchImpl } = recorded(() => jsonResponse(200, []));
		const client = pgFor(fetchImpl).asService();
		await assert.rejects(client.rpc('bad-name', {}), TypeError);
		await assert.rejects(client.rpc('Drop_Table', {}), TypeError);
		assert.equal(calls.length, 0);
		await client.rpc('list_account_sessions', { p_limit: 10 });
		assert.equal(calls[0].url, `${BASE}/rpc/list_account_sessions`);
		assert.equal(calls[0].init.method, 'POST');
		assert.equal(calls[0].init.body, JSON.stringify({ p_limit: 10 }));
	});
});
