/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-admin-users.test.mjs                 +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**

/**
 * The users administration API: the gate that re-reads the roles, the keyset list, the profile
 * edit, the role grants and the audit row that has to land before any of them.
 *
 * The fake behind the handler is the keyset store: it applies the `or=(...)` page filter, so
 * the second page of a list is proved by rows and not by the shape of a query string.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createUserSession, validateBridgePayload, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../scripts/bridge-account-mounts.mjs';
import { encodeCursor } from '../../scripts/bridge-paging.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import { ACCOUNT_JWT_SECRET, accountConfig, send, USER_A, USER_B } from './support/account-world.mjs';
import { createKeysetStore } from './support/keyset-postgrest.mjs';
import { kvStub } from './support/kv-stub.mjs';

const USER_C = 'cccccccc-3333-4333-8333-cccccccccccc';
const ROLE_IDS = {
	admin: '11111111-0000-4000-8000-000000000001',
	moderator: '11111111-0000-4000-8000-000000000002',
	user: '11111111-0000-4000-8000-000000000003',
	guest: '11111111-0000-4000-8000-000000000004',
};
const SELECT = 'user_id,display_name,username,directory_opt_out,created_at,updated_at';
const USERS = '/api/account/admin/users';
const AUDIT = 'osionos_bridge_audit_events';

function profile(userId, displayName, extra = {}) {
	return { user_id: userId, display_name: displayName, username: displayName.toLowerCase(), directory_opt_out: false, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...extra };
}

function seed({ withoutRoles = [], grants = [{ userId: USER_A, role: 'admin' }], profiles } = {}) {
	return {
		osionos_profiles: profiles ?? [profile(USER_A, 'Ada', { email: 'ada@example.com' }), profile(USER_B, 'Bob', { email: 'bob@example.com' }), profile(USER_C, 'Cyd', { email: 'cyd@example.com' })],
		roles: Object.entries(ROLE_IDS).filter(([name]) => !withoutRoles.includes(name)).map(([name, id]) => ({ id, name })),
		user_roles: grants.map(({ userId, role }) => ({ user_id: userId, role_id: ROLE_IDS[role], expires_at: null })),
		[AUDIT]: [],
	};
}

/** A real app session; `claim` is the is_admin flag the token carries, which the routes must ignore. */
function tokenFor(config, userId = USER_A, claim = false) {
	const payload = validateBridgePayload({ provider: 'prismatica', subject: userId, email: 'member@example.com', name: 'Member', jti: randomUUID() });
	const persisted = { workspaceId: '0a4d1c2e-0000-4000-8000-000000000ad1', workspaceName: 'Home', workspaceSlug: 'home' };
	return createUserSession(payload, config, persisted, Date.now(), [], claim).session.accessToken;
}

/** The account handler alone, the keyset store behind the real createPg transport. */
async function world(t, { tables = seed(), refuse = [], kv = kvStub() } = {}) {
	const config = accountConfig();
	const store = createKeysetStore({ tables, refuse });
	const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
	const handler = createAccountHandler({ config, pg, kv, verifySession: verifyAppSessionToken, env: { JWT_SECRET: ACCOUNT_JWT_SECRET } });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		try {
			if (await handler(url, request, response)) return;
			response.writeHead(404).end('{}');
		} catch (error) {
			const retry = Number.isFinite(error?.retryAfterSeconds) ? { 'retry-after': String(error.retryAfterSeconds) } : {};
			response.writeHead(error?.status ?? 500, { 'content-type': 'application/json', ...retry });
			response.end(JSON.stringify({ ok: false, message: error?.message, code: error?.code }));
		}
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	const base = `http://127.0.0.1:${server.address().port}`;
	const admin = tokenFor(config, USER_A);
	return { store, config, kv, base, admin, call: (path, options = {}) => send(base, `${USERS}${path}`, { token: admin, ...options }) };
}

describe('the keyset list', () => {
	it('serves two pages over three profiles and then an empty one', async (t) => {
		const { call, store } = await world(t);
		const first = await call('?limit=2');
		assert.equal(first.status, 200);
		assert.deepEqual(first.body.users.map((user) => user.displayName), ['Ada', 'Bob']);
		assert.equal(typeof first.body.nextCursor, 'string');
		assert.equal(store.callsTo('osionos_profiles')[0].params.has('or'), false);

		const second = await call(`?limit=2&cursor=${first.body.nextCursor}`);
		assert.deepEqual(second.body.users.map((user) => user.displayName), ['Cyd']);
		assert.equal(second.body.nextCursor, null);
		assert.match(store.callsTo('osionos_profiles')[1].params.get('or'), /^\(display_name\.gt\./);

		const third = await call(`?limit=2&cursor=${encodeCursor(['Cyd', USER_C])}`);
		assert.deepEqual(third.body, { ok: true, users: [], nextCursor: null });
	});

	it('selects exactly the allowlist, so an email in the row never reaches the answer', async (t) => {
		const { call, store } = await world(t);
		const answer = await call('');
		const read = store.callsTo('osionos_profiles')[0];
		assert.equal(read.params.get('select'), SELECT);
		assert.deepEqual(Object.keys(answer.body.users[0]).sort(), ['createdAt', 'directoryOptOut', 'displayName', 'updatedAt', 'userId', 'username']);
		assert.equal(answer.text.includes('example.com'), false);
	});

	it('orders by the index columns and reads one row more than the page', async (t) => {
		const { call, store } = await world(t);
		await call('?limit=2');
		const read = store.callsTo('osionos_profiles')[0];
		assert.equal(read.params.get('order'), 'display_name.asc,user_id.asc');
		assert.equal(read.params.get('limit'), '3');
	});

	it('refuses a tampered cursor and caps the limit at 100', async (t) => {
		const { call, store } = await world(t);
		const bad = await call('?cursor=not-a-cursor!');
		assert.equal(bad.status, 422);
		assert.equal(bad.body.code, 'invalid_cursor');
		const wrongArity = await call(`?cursor=${encodeCursor(['only-one'])}`);
		assert.equal(wrongArity.body.code, 'invalid_cursor');
		await call('?limit=1000');
		assert.equal(store.callsTo('osionos_profiles').at(-1).params.get('limit'), '101');
	});
});

describe('the gate re-reads the roles', () => {
	it('refuses a token that claims admin when the grants say user, before any profile is read', async (t) => {
		const { base, config, store } = await world(t, { tables: seed({ grants: [{ userId: USER_B, role: 'user' }] }) });
		const token = tokenFor(config, USER_B, true);
		const answer = await send(base, USERS, { token });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'admin_required');
		assert.equal(store.callsTo('osionos_profiles').length, 0);
	});

	it('refuses an admin claim with no grant at all, on every route', async (t) => {
		const { base, config, store } = await world(t, { tables: seed({ grants: [] }) });
		const token = tokenFor(config, USER_A, true);
		for (const [method, path, body] of [['GET', USERS], ['GET', `${USERS}/${USER_B}`], ['PATCH', `${USERS}/${USER_B}`, { displayName: 'x' }], ['PUT', `${USERS}/${USER_B}/roles`, { role: 'admin', action: 'grant' }]]) {
			const answer = await send(base, path, { method, token, body });
			assert.equal(answer.status, 403, `${method} ${path}`);
			assert.equal(answer.body.code, 'admin_required');
		}
		assert.equal(store.callsTo('osionos_profiles').length, 0);
		assert.equal(store.callsTo(AUDIT).length, 0);
	});

	it('lets a token that says nothing in when the grants say admin', async (t) => {
		const { call } = await world(t);
		assert.equal((await call('')).status, 200);
	});

	it('refuses a missing session', async (t) => {
		const { base } = await world(t);
		assert.equal((await send(base, USERS)).status, 401);
	});

	it('refuses an expired grant', async (t) => {
		const tables = seed();
		tables.user_roles[0].expires_at = '2020-01-01T00:00:00.000Z';
		const { call } = await world(t, { tables });
		assert.equal((await call('')).body.code, 'admin_required');
	});
});

describe('one user', () => {
	it('answers the profile and the platform role names', async (t) => {
		const tables = seed({ grants: [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'user' }, { userId: USER_B, role: 'moderator' }] });
		const { call } = await world(t, { tables });
		const answer = await call(`/${USER_B}`);
		assert.equal(answer.status, 200);
		assert.equal(answer.body.user.displayName, 'Bob');
		assert.deepEqual([...answer.body.roles].sort(), ['moderator', 'user']);
		assert.equal(answer.text.includes('example.com'), false);
	});

	it('answers 404 for an unknown user and 422 for a path that is not a uuid', async (t) => {
		const { call } = await world(t);
		assert.equal((await call(`/${randomUUID()}`)).body.code, 'user_not_found');
		assert.equal((await call('/not-a-uuid')).body.code, 'invalid_user_id');
	});
});

describe('PATCH a profile', () => {
	it('changes the display name and answers the new row', async (t) => {
		const { call, store } = await world(t);
		const answer = await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: '  Bobby  ' } });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.user.displayName, 'Bobby');
		assert.equal(store.rows('osionos_profiles').find((row) => row.user_id === USER_B).display_name, 'Bobby');
		assert.match(store.callsTo('osionos_profiles').at(-1).prefer, /return=representation/);
	});

	it('changes directoryOptOut to false', async (t) => {
		const tables = seed({ profiles: [profile(USER_A, 'Ada'), profile(USER_B, 'Bob', { directory_opt_out: true })] });
		const { call } = await world(t, { tables });
		const answer = await call(`/${USER_B}`, { method: 'PATCH', body: { directoryOptOut: false } });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.user.directoryOptOut, false);
	});

	it('refuses every other key, username included, by name', async (t) => {
		const { call, store } = await world(t);
		for (const key of ['username', 'email', 'user_id', 'bio']) {
			const answer = await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: 'ok', [key]: 'x' } });
			assert.equal(answer.status, 422, key);
			assert.equal(answer.body.code, 'field_not_editable');
			assert.ok(answer.body.message.includes(key));
		}
		assert.equal(store.callsTo(AUDIT).length, 0);
	});

	it('refuses an empty, over-long or control-character display name', async (t) => {
		const { call } = await world(t);
		for (const displayName of ['', '   ', 'x'.repeat(101), 'a\u0000b', 7]) {
			const answer = await call(`/${USER_B}`, { method: 'PATCH', body: { displayName } });
			assert.equal(answer.status, 422, JSON.stringify(displayName));
		}
		assert.equal((await call(`/${USER_B}`, { method: 'PATCH', body: {} })).status, 422);
	});
});

describe('PUT roles', () => {
	const put = (call, role, action, userId = USER_B) => call(`/${userId}/roles`, { method: 'PUT', body: { role, action } });

	it('grants a role: the user_roles row exists', async (t) => {
		const { call, store } = await world(t);
		const answer = await put(call, 'moderator', 'grant');
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body.roles, ['moderator']);
		assert.ok(store.rows('user_roles').some((row) => row.user_id === USER_B && row.role_id === ROLE_IDS.moderator));
		const write = store.callsTo('user_roles').find((call) => call.method === 'POST');
		assert.equal(write.params.get('on_conflict'), 'user_id,role_id');
		assert.match(write.prefer, /resolution=merge-duplicates/);
		await put(call, 'moderator', 'grant');
		assert.equal(store.rows('user_roles').filter((row) => row.user_id === USER_B).length, 1);
	});

	it('revokes a role: the row is gone', async (t) => {
		const { call, store } = await world(t, { tables: seed({ grants: [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'moderator' }] }) });
		const answer = await put(call, 'moderator', 'revoke');
		assert.equal(answer.status, 200);
		assert.equal(store.rows('user_roles').some((row) => row.user_id === USER_B), false);
		assert.equal(store.rows('user_roles').length, 1);
	});

	it('refuses an unknown role or action', async (t) => {
		const { call, store } = await world(t);
		for (const [role, action] of [['owner', 'grant'], ['moderator', 'promote'], [undefined, 'grant'], ['admin', undefined]]) {
			const answer = await put(call, role, action);
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, 'invalid_role');
		}
		assert.equal(store.callsTo(AUDIT).length, 0);
	});

	it('refuses an admin revoking their own admin role, and still lets another admin go', async (t) => {
		const { call, store } = await world(t, { tables: seed({ grants: [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'admin' }] }) });
		const own = await put(call, 'admin', 'revoke', USER_A);
		assert.equal(own.status, 422);
		assert.equal(own.body.code, 'self_role_change');
		assert.equal(store.callsTo(AUDIT).length, 0);
		assert.equal((await put(call, 'admin', 'revoke', USER_B)).status, 200);
	});

	it('answers 503 when the roles row is missing, before any audit row or write', async (t) => {
		const { call, store } = await world(t, { tables: seed({ withoutRoles: ['guest'] }) });
		const answer = await put(call, 'guest', 'grant');
		assert.equal(answer.status, 503);
		assert.equal(answer.body.code, 'platform_roles_unavailable');
		assert.equal(store.callsTo(AUDIT).length, 0);
		assert.equal(store.callsTo('user_roles').filter((entry) => entry.method !== 'GET').length, 0);
	});
});

describe('the audit row comes first', () => {
	const writeIndex = (store, table, method) => store.calls.findIndex((call) => call.table === table && call.method === method);

	it('writes the audit row before the profile write', async (t) => {
		const { call, store } = await world(t);
		await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: 'Bobby' } });
		const audit = store.rows(AUDIT)[0];
		assert.equal(audit.event_type, 'admin_user_update');
		assert.equal(audit.actor_id, USER_A);
		assert.deepEqual(audit.details, { targetUserId: USER_B, fields: ['display_name'] });
		assert.ok(writeIndex(store, AUDIT, 'POST') < writeIndex(store, 'osionos_profiles', 'PATCH'));
	});

	it('writes the audit row before the role write', async (t) => {
		const { call, store } = await world(t);
		await call(`/${USER_B}/roles`, { method: 'PUT', body: { role: 'moderator', action: 'grant' } });
		assert.deepEqual(store.rows(AUDIT)[0].details, { targetUserId: USER_B, role: 'moderator', action: 'grant' });
		assert.equal(store.rows(AUDIT)[0].event_type, 'admin_role_change');
		assert.ok(writeIndex(store, AUDIT, 'POST') < writeIndex(store, 'user_roles', 'POST'));
	});

	it('changes nothing when the audit write fails', async (t) => {
		const { call, store } = await world(t, { refuse: [AUDIT], tables: seed({ grants: [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'moderator' }] }) });
		const edit = await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: 'Bobby' } });
		assert.equal(edit.status, 503);
		assert.equal(edit.body.code, 'audit_unavailable');
		assert.equal(store.rows('osionos_profiles').find((row) => row.user_id === USER_B).display_name, 'Bob');
		const grant = await call(`/${USER_B}/roles`, { method: 'PUT', body: { role: 'admin', action: 'grant' } });
		assert.equal(grant.body.code, 'audit_unavailable');
		const revoke = await call(`/${USER_B}/roles`, { method: 'PUT', body: { role: 'moderator', action: 'revoke' } });
		assert.equal(revoke.body.code, 'audit_unavailable');
		assert.deepEqual(store.rows('user_roles').map((row) => `${row.user_id}:${row.role_id}`).sort(), [`${USER_A}:${ROLE_IDS.admin}`, `${USER_B}:${ROLE_IDS.moderator}`].sort());
	});
});

describe('the throttle and the credential', () => {
	it('answers 429 with retryAfterSeconds on the 61st read of a minute', async (t) => {
		const { call } = await world(t);
		for (let count = 0; count < 60; count += 1) assert.equal((await call('?limit=1')).status, 200);
		const limited = await call('?limit=1');
		assert.equal(limited.status, 429);
		assert.equal(limited.body.retryAfterSeconds, 60);
	});

	it('throttles the writes at 30 a minute, apart from the reads', async (t) => {
		const { call } = await world(t);
		for (let count = 0; count < 30; count += 1) assert.equal((await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: `n${count}` } })).status, 200);
		assert.equal((await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: 'late' } })).status, 429);
		assert.equal((await call('?limit=1')).status, 200);
	});

	it('sends every request with the service key and never a per-user JWT', async (t) => {
		const { call, store, config } = await world(t);
		await call('');
		await call(`/${USER_B}`);
		await call(`/${USER_B}`, { method: 'PATCH', body: { displayName: 'Bobby' } });
		await call(`/${USER_B}/roles`, { method: 'PUT', body: { role: 'moderator', action: 'grant' } });
		assert.ok(store.calls.length > 8);
		for (const entry of store.calls) {
			assert.equal(entry.authorization, `Bearer ${config.serviceKey}`);
			assert.equal(entry.apikey, config.serviceKey);
		}
	});
});

describe('the keyset store itself', () => {
	it('throws on a filter it does not know instead of matching every row', async () => {
		const store = createKeysetStore({ tables: seed() });
		await assert.rejects(store.fetchImpl('https://baas.local/rest/v1/osionos_profiles?display_name=ilike.*a*'), /unsupported filter/);
		await assert.rejects(store.fetchImpl('https://baas.local/rest/v1/osionos_profiles?or=(display_name.fts.a)'), /unsupported filter/);
	});
});
