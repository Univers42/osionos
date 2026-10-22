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
import {
	ACCOUNT_DB_ROLE, ACCOUNT_JWT_AUDIENCE, ACCOUNT_JWT_TTL_SECONDS, createPg, decodeCursor,
	encodeCursor, idChunks, inFilter, keyset, mintAccountJwt, pageOf,
} from '../../scripts/bridge-pg.mjs';
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
	userId: USER_ID, workspaceIds: [WORKSPACE_ID], roles: { [WORKSPACE_ID]: 'owner' }, isAdmin: false,
	raw: { iss: 'osionos-bridge', aud: 'osionos-app', sub: USER_ID, jti: SESSION_ID, iat: 1, exp: 2 },
};
const decodeJwt = (token) => {
	const [header, payload, signature] = token.split('.');
	return {
		header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
		payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
		signature, signingInput: `${header}.${payload}`,
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
const invalidCursor = (error) => error?.status === 422 && error?.code === 'invalid_cursor';
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
	it('omits sid without a session id and honours a shorter ttl', () => {
		const plain = decodeJwt(mintAccountJwt({ userId: USER_ID, secret: SECRET, nowMs: 1_760_000_000_000 })).payload;
		assert.equal('sid' in plain, false);
		assert.equal(plain.exp - plain.iat, 120);
		const short = decodeJwt(mintAccountJwt({ userId: USER_ID, secret: SECRET, nowMs: 1_760_000_000_000, ttlSeconds: 30 })).payload;
		assert.equal(short.exp - short.iat, 30);
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
		const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
		await assert.rejects(pgFor(fetchImpl).asService().get('osionos_profiles'), predicate(503, 'baas_unreachable'));
	});
	it('maps a timeout to baas_unreachable', async () => {
		const fetchImpl = (url, init) => new Promise((resolve, reject) => {
			// The fallback timer keeps the loop alive long enough for the unref'd timeout signal.
			const fallback = setTimeout(() => reject(new Error('not aborted')), 200);
			init.signal.addEventListener('abort', () => { clearTimeout(fallback); reject(new Error('aborted')); });
		});
		const pg = createPg({ config: CONFIG, env: ENV, fetchImpl, timeoutMs: 5 });
		await assert.rejects(pg.asService().get('osionos_profiles'), predicate(503, 'baas_unreachable'));
	});
});
describe('path guard', () => {
	const unsafe = ['/x', 'a/../b', 'http://x', 'a\nb', 'a\\b', '%2E%2e/%2e%2e/auth/v1/admin/users', 'x/%2F..', '%5c'];
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
describe('idChunks', () => {
	const idsOf = (count) => Array.from({ length: count }, (_, index) => `id-${index}`);
	it('splits 0, 1, 50, 51 and 500 ids', () => {
		assert.deepEqual(idChunks([]), []);
		assert.deepEqual(idChunks(idsOf(1)), [idsOf(1)]);
		assert.equal(idChunks(idsOf(50)).length, 1);
		const fiftyOne = idChunks(idsOf(51));
		assert.deepEqual(fiftyOne.map((chunk) => chunk.length), [50, 1]);
		assert.equal(idChunks(idsOf(500)).length, 10);
	});
	it('drops nulls, empties and duplicates keeping first-seen order', () => {
		assert.deepEqual(idChunks(['b', null, 'a', '', undefined, 'b', 'c', 'a']), [['b', 'a', 'c']]);
		for (const size of [0, 501, 1.5]) assert.throws(() => idChunks(['a'], size), RangeError);
	});
});
describe('inFilter', () => {
	it('quotes, escapes and encodes every hostile value', () => {
		const ids = ['a,b', 'c.d', 'e(f)', 'g)h', 'i"j', 'k\\l'];
		const result = inFilter('id', ids);
		assert.equal(result, 'id=in.(%22a%2Cb%22,%22c.d%22,%22e(f)%22,%22g)h%22,%22i%5C%22j%22,%22k%5C%5Cl%22)');
		const encodedValues = result.slice('id=in.('.length, -1).split(',');
		const unquoted = encodedValues.map((value) => decodeURIComponent(value).slice(1, -1).replace(/\\(["\\])/g, '$1'));
		assert.deepEqual(unquoted, ids);
		for (const column of ['Id', 'id;drop', '', 'id)']) assert.throws(() => inFilter(column, ['a']), TypeError);
		assert.throws(() => inFilter('id', []), TypeError);
	});
});
describe('cursors', () => {
	it('round-trips and rejects every malformed cursor', () => {
		assert.deepEqual(decodeCursor(encodeCursor(['a', 2]), 2), ['a', 2]);
		const encoded = (text) => Buffer.from(text).toString('base64url');
		assert.throws(() => decodeCursor('A'.repeat(513), 1), invalidCursor);
		assert.throws(() => decodeCursor('not*base64url', 1), invalidCursor);
		assert.throws(() => decodeCursor('', 1), invalidCursor);
		assert.throws(() => decodeCursor(encoded('not json'), 1), invalidCursor);
		assert.throws(() => decodeCursor(encoded('{"a":1}'), 1), invalidCursor);
		assert.throws(() => decodeCursor(encodeCursor(['a']), 2), invalidCursor);
		for (const value of ['[true]', '[null]', '[{}]']) assert.throws(() => decodeCursor(encoded(value), 1), invalidCursor);
	});
});
describe('keyset', () => {
	it('orders one column without a cursor', () => {
		assert.deepEqual(keyset({ order: [['a', 'asc']] }), { query: 'order=a.asc&limit=21', take: 20 });
	});
	it('uses the direction operator of each column', () => {
		assert.equal(keyset({ order: [['a', 'desc']], cursor: ['x'], limit: 5 }).query, 'order=a.desc&limit=6&or=(a.lt.%22x%22)');
		assert.equal(keyset({ order: [['a', 'asc']], cursor: ['x'], limit: 5 }).query, 'order=a.asc&limit=6&or=(a.gt.%22x%22)');
	});
	it('builds two- and three-column filters', () => {
		const mixed = keyset({ order: [['a', 'desc'], ['b', 'asc']], cursor: ['x', 'y'] });
		assert.equal(mixed.query, 'order=a.desc,b.asc&limit=21&or=(a.lt.%22x%22,and(a.eq.%22x%22,b.gt.%22y%22))');
		const three = keyset({ order: [['a', 'desc'], ['b', 'desc'], ['c', 'desc']], cursor: ['x', 'y', 'z'] });
		assert.equal(three.query, 'order=a.desc,b.desc,c.desc&limit=21&or=(a.lt.%22x%22,and(a.eq.%22x%22,b.lt.%22y%22),and(a.eq.%22x%22,b.eq.%22y%22,c.lt.%22z%22))');
	});
	it('parses limits', () => {
		const order = [['a', 'asc']];
		assert.equal(keyset({ order, limit: 0 }).take, 1);
		assert.equal(keyset({ order }).take, 20);
		assert.equal(keyset({ order, limit: '50' }).take, 50);
		assert.equal(keyset({ order, limit: 'abc' }).take, 20);
		assert.equal(keyset({ order, limit: 1000 }).take, 100);
		assert.equal(keyset({ order, limit: 1000, maxLimit: 40 }).take, 40);
		assert.equal(keyset({ order, limit: 5 }).query, 'order=a.asc&limit=6');
	});
	it('keeps a hostile cursor inside one or parameter', () => {
		for (const value of ['"', ')', ',', '&', '+', '2026-10-22T00:00:00+00:00']) {
			const { query } = keyset({ order: [['a', 'asc']], cursor: [value], limit: 5 });
			const params = new URLSearchParams(query);
			assert.equal(params.getAll('or').length, 1, `or parameter for ${value}`);
			assert.equal(params.getAll('order').length, 1);
			assert.equal(params.getAll('limit').length, 1);
			const quoted = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
			assert.equal(params.get('or'), `(a.gt.${quoted})`);
		}
	});
});
describe('pageOf', () => {
	const order = [['created_at', 'desc'], ['id', 'asc']];
	const row = (createdAt, id) => ({ created_at: createdAt, id });
	it('reports no next page on exactly take rows', () => {
		const rows = [row('2026-10-22T00:00:02Z', 'a'), row('2026-10-22T00:00:01Z', 'b')];
		assert.deepEqual(pageOf(rows, order, 2), { items: rows, nextCursor: null });
	});
	it('builds the cursor from row take-1 when a next page exists', () => {
		const rows = [row('2026-10-22T00:00:03Z', 'a'), row('2026-10-22T00:00:02Z', 'b'), row('2026-10-22T00:00:01Z', 'c')];
		const { items, nextCursor } = pageOf(rows, order, 2);
		assert.deepEqual(items, rows.slice(0, 2));
		assert.deepEqual(decodeCursor(nextCursor, 2), ['2026-10-22T00:00:02Z', 'b']);
	});
	it('refuses a null order value in the cursor row', () => {
		const rows = [row('2026-10-22T00:00:03Z', 'a'), row(null, 'b'), row('2026-10-22T00:00:01Z', 'c')];
		assert.throws(() => pageOf(rows, order, 2), TypeError);
	});
});
