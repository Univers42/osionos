/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-database-role-gating.test.mjs                +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A mounted database is gated on the CALLER's role in the workspace that owns the
// mount, not on membership alone: a viewer may read the rows, an editor may write
// them, and only the workspace owner/admin may change the SHAPE of the database —
// a DDL op changes the table other members' rows live in.
//
// The harness's default PostgREST stub answers "owner + every permission" for every
// workspace the session lists, so a role gate could never fire. The world below is
// built with `realWorkspaceRpc: true`, which answers the workspace RPC from the
// seeded osionos_workspace_members rows — the role the bridge sees IS the seeded
// one, and the test asserts it (a viewer case that passed while the bridge saw
// "owner" would be a green lie).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canReadDatabase, canRunDdl, canWriteDatabase, configFromEnv } from '../../scripts/bridge-api.mjs';
import { createPostgrestMock, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

// The sql-ro route answers 404 unless the bridge is started with OSIONOS_SQL_RO=1.
process.env.OSIONOS_SQL_RO = '1';

const DB = 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0';
const WS = 'e0e0e0e0-2222-4222-8222-e0e0e0e0e0e0';
const WS2 = 'e1e1e1e1-3333-4333-8333-e1e1e1e1e1e1';
const OWNER = 'f0000000-1111-4111-8111-f000000000f0';
const EDITOR = 'f0000000-2222-4222-8222-f000000000f0';
const VIEWER = 'f0000000-3333-4333-8333-f000000000f0';
const NOROAD = 'f0000000-4444-4444-8444-f000000000f0';
const OUTSIDER = 'f0000000-5555-4555-8555-f000000000f0';
const TABLE = 'tasks';

const config = configFromEnv({
	OSIONOS_SESSION_CUTOFFS: 'off',
	OSIONOS_SESSION_RECORDS: 'off',
	OSIONOS_APP_URL: 'http://localhost:3001',
	OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
	OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
	OSIONOS_BAAS_URL: 'http://baas.local',
	KONG_SERVICE_API_KEY: 'service-role-test-key',
	OSIONOS_QUERY_ROUTER_URL: 'http://query-router.local',
	OSIONOS_BAAS_API_KEY: 'tenant-test-key',
	OSIONOS_BAAS_TENANT_ID: 'tenant-test-id',
	OSIONOS_ADAPTER_REGISTRY_URL: 'http://registry.local',
});

/** The membership vocabulary the app writes (scripts/bridge-workspace-invites.mjs). */
const MEMBERS = [
	{ user_id: OWNER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
	{ user_id: EDITOR, role: 'editor', permissions: ['create', 'read', 'update', 'delete'] },
	{ user_id: VIEWER, role: 'viewer', permissions: ['read'] },
	{ user_id: NOROAD, role: 'viewer', permissions: [] },
];

/** A session for `userId` that lists `workspaceIds` as shared workspaces. */
function asUser(userId, workspaceIds) {
	return sessionHeaders(config, userId, `a1000000-1111-4111-8111-a1000000${userId.slice(-4)}`, workspaceIds);
}

/**
 * The seeded world plus the two upstreams the database routes talk to: the
 * query-router (the engine) and the adapter-registry (the tenant's mount list).
 * Every query-router call is recorded, so a test can prove a refused op never
 * reached the engine.
 */
function world({ mounts = [{ workspace_id: WS, db_id: DB, engine: 'postgresql', tables: [TABLE], edges_table: null, label: 'Tasks' }], members = MEMBERS } = {}) {
	const mock = createPostgrestMock({
		osionos_workspace_members: members.map((member) => ({ workspace_id: WS, ...member })),
		osionos_workspace_databases: mounts,
	}, { realWorkspaceRpc: true });
	const routed = [];
	const rpcRoles = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.origin === 'http://query-router.local') {
			routed.push({ path: parsed.pathname, body: init.body ? JSON.parse(init.body) : null });
			if (parsed.pathname.endsWith('/schema')) return Response.json({ tables: [{ name: TABLE }], engine: 'postgresql' });
			return Response.json([{ id: 7, name: 'row' }]);
		}
		if (parsed.origin === 'http://registry.local') return Response.json([{ id: DB, name: 'Tasks', engine: 'postgresql' }]);
		const response = await mock.fetchImpl(url, init);
		if (parsed.pathname.endsWith('/rpc/osionos_bridge_list_workspaces')) {
			const answer = await response.clone().json();
			for (const row of Array.isArray(answer) ? answer : []) rpcRoles.push(row.workspace_role);
		}
		return response;
	};
	return { fetchImpl, routed, rpcRoles };
}

/** One call against a fresh bridge: the answer, and the calls that reached the engine. */
async function call(route, userId, { workspaces = [WS], ...worldOptions } = {}) {
	const made = world(worldOptions);
	const answer = await withBridge(config, made.fetchImpl, async (base) => route.call(base, asUser(userId, workspaces)));
	return { answer, routed: made.routed };
}

const READ_ROUTES = [
	{ name: 'list', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'list' })) },
	{ name: 'get', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'get' })) },
	{ name: 'aggregate', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'aggregate' })) },
	{ name: 'sql-ro', call: (base, headers) => send(base, `/api/databases/${DB}/sql-ro`, headers, post({ sql: 'select 1' })) },
	{ name: 'schema', call: (base, headers) => send(base, `/api/databases/${DB}/schema`, headers) },
];

const WRITE_ROUTES = [
	{ name: 'insert', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'insert', values: { name: 'x' } })) },
	{ name: 'update', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'update', values: { name: 'x' } })) },
	{ name: 'delete', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'delete', filter: { id: 7 } })) },
	{ name: 'upsert', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'upsert', values: { id: 7 } })) },
	{ name: 'batch', call: (base, headers) => send(base, `/api/databases/${DB}/tables/${TABLE}`, headers, post({ op: 'batch', values: [{ name: 'x' }] })) },
	{ name: 'txn', call: (base, headers) => send(base, '/api/databases/txn', headers, post({ mount: DB, ops: [{ op: 'insert', values: { name: 'x' } }] })) },
];

const DDL_ROUTES = ['create_table', 'drop_table', 'add_column', 'drop_column', 'alter_column_type'].map((op) => ({
	name: `ddl ${op}`,
	call: (base, headers) => send(base, `/api/databases/${DB}/schema/ddl`, headers, post({ op, table: TABLE, column: 'name' })),
}));

describe('the database predicates read the membership role', () => {
	it('reads: owner, admin and editor roles, or a read/admin permission', () => {
		assert.equal(canReadDatabase({ role: 'owner', permissions: [] }), true);
		assert.equal(canReadDatabase({ role: 'admin', permissions: [] }), true);
		assert.equal(canReadDatabase({ role: 'editor', permissions: [] }), true);
		assert.equal(canReadDatabase({ role: 'viewer', permissions: ['read'] }), true);
		assert.equal(canReadDatabase({ role: 'viewer', permissions: ['admin'] }), true);
		assert.equal(canReadDatabase({ role: 'viewer', permissions: [] }), false);
		assert.equal(canReadDatabase(null), false);
	});

	it('writes: owner, admin, or an update/admin permission', () => {
		assert.equal(canWriteDatabase({ role: 'owner', permissions: [] }), true);
		assert.equal(canWriteDatabase({ role: 'admin', permissions: [] }), true);
		assert.equal(canWriteDatabase({ role: 'editor', permissions: ['update'] }), true);
		assert.equal(canWriteDatabase({ role: 'viewer', permissions: ['update'] }), true);
		assert.equal(canWriteDatabase({ role: 'viewer', permissions: ['read'] }), false);
		assert.equal(canWriteDatabase(null), false);
	});

	it('runs DDL: owner, admin, or the admin permission', () => {
		assert.equal(canRunDdl({ role: 'owner', permissions: [] }), true);
		assert.equal(canRunDdl({ role: 'admin', permissions: [] }), true);
		assert.equal(canRunDdl({ role: 'editor', permissions: ['create', 'read', 'update', 'delete'] }), false);
		assert.equal(canRunDdl({ role: 'viewer', permissions: ['read'] }), false);
		assert.equal(canRunDdl(null), false);
	});
});

describe('a mounted database is gated on the caller role', () => {
	for (const route of READ_ROUTES) {
		it(`${route.name} → 200 for the owner, the editor and the viewer`, async () => {
			for (const [role, userId] of [['owner', OWNER], ['editor', EDITOR], ['viewer', VIEWER]]) {
				const { answer, routed } = await call(route, userId);
				assert.equal(answer.status, 200, `${role}: ${answer.text}`);
				assert.ok(routed.length > 0, `${role}: the op never reached the engine`);
			}
		});
	}

	for (const route of WRITE_ROUTES) {
		it(`${route.name} → 200 for the owner and the editor, 403 for the viewer`, async () => {
			for (const [role, userId] of [['owner', OWNER], ['editor', EDITOR]]) {
				const { answer } = await call(route, userId);
				assert.equal(answer.status, 200, `${role}: ${answer.text}`);
			}
			const { answer, routed } = await call(route, VIEWER);
			assert.equal(answer.status, 403, answer.text);
			assert.equal(answer.body.ok, false);
			assert.equal(answer.body.code, 'database_permission_denied');
			assert.equal(answer.body.message, 'You do not have permission to modify this database.');
			assert.deepEqual(routed, [], 'the refused op reached the engine');
		});
	}

	for (const route of DDL_ROUTES) {
		it(`${route.name} → 200 for the owner, 403 for the editor and the viewer`, async () => {
			const { answer } = await call(route, OWNER);
			assert.equal(answer.status, 200, answer.text);
			for (const [role, userId] of [['editor', EDITOR], ['viewer', VIEWER]]) {
				const { answer: refused, routed } = await call(route, userId);
				assert.equal(refused.status, 403, `${role}: ${refused.text}`);
				assert.equal(refused.body.code, 'database_permission_denied');
				assert.equal(refused.body.message, 'You do not have permission to modify this database.');
				assert.deepEqual(routed, [], `${role}: the refused DDL reached the engine`);
			}
		});
	}

	it('a member who may not read is refused with the read code', async () => {
		const { answer, routed } = await call(READ_ROUTES[0], NOROAD);
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.code, 'database_read_denied');
		assert.equal(answer.body.message, 'You do not have permission to read this database.');
		assert.deepEqual(routed, []);
	});

	it('the bridge sees the seeded role, not the stub owner', async () => {
		const made = world();
		await withBridge(config, made.fetchImpl, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/tables/${TABLE}`, asUser(VIEWER, [WS]), post({ op: 'insert', values: { name: 'x' } }));
			assert.equal(answer.status, 403, answer.text);
		});
		assert.ok(made.rpcRoles.includes('viewer'), `the bridge never saw the viewer role: ${JSON.stringify(made.rpcRoles)}`);
		assert.ok(!made.rpcRoles.includes('owner'), `the bridge saw the stub owner: ${JSON.stringify(made.rpcRoles)}`);
	});

	it('an unknown op is forwarded as a list and gated as a read', async () => {
		const made = world();
		await withBridge(config, made.fetchImpl, async (base) => {
			const answer = await send(base, `/api/databases/${DB}/tables/${TABLE}`, asUser(VIEWER, [WS]), post({ op: 'drop_everything' }));
			assert.equal(answer.status, 200, answer.text);
		});
		assert.equal(made.routed.length, 1);
		assert.equal(made.routed[0].body.op, 'list');
	});

	it('a non-member is refused by the mount ACL, not by the role gate', async () => {
		const { answer, routed } = await call(READ_ROUTES[0], OUTSIDER, { workspaces: [] });
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.message, 'Database is not linked to an accessible workspace.');
		assert.equal(answer.body.code, undefined);
		assert.deepEqual(routed, []);
	});

	it('a member of another workspace is refused by the mount ACL', async () => {
		const { answer, routed } = await call(READ_ROUTES[0], OUTSIDER, { workspaces: [WS2] });
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.message, 'Database is not linked to an accessible workspace.');
		assert.deepEqual(routed, []);
	});

	it('the listing shows a mounted database only to a membership that may read it', async () => {
		for (const [userId, expected] of [[OWNER, 1], [EDITOR, 1], [VIEWER, 1], [NOROAD, 0]]) {
			const { answer } = await call({ call: (base, headers) => send(base, '/api/databases', headers) }, userId);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.databases.length, expected, `${userId}: ${answer.text}`);
		}
	});

	it('the record routes are gated on the read capability', async () => {
		const { answer } = await call({ call: (base, headers) => send(base, `/api/records/${DB}/${TABLE}/7`, headers) }, VIEWER);
		assert.equal(answer.status, 200, answer.text);
		const { answer: refused } = await call({ call: (base, headers) => send(base, `/api/records/${DB}/${TABLE}/7`, headers) }, NOROAD);
		assert.equal(refused.status, 403, refused.text);
		assert.equal(refused.body.code, 'database_read_denied');
	});

	it('the record graph takes the mounts the caller may read', async () => {
		const { routed } = await call({ call: (base, headers) => send(base, '/api/graph/data', headers) }, VIEWER);
		assert.ok(routed.some((entry) => entry.path === '/graph/overview'), 'the viewer lost the record graph');
		const { routed: refused } = await call({ call: (base, headers) => send(base, '/api/graph/data', headers) }, NOROAD);
		assert.ok(!refused.some((entry) => entry.path === '/graph/overview'), 'a member who may not read still got the record graph');
	});
});

describe('a database mounted in two of the caller workspaces', () => {
	it('takes the most permissive of the caller roles', async () => {
		const mounts = [
			{ workspace_id: WS, db_id: DB, engine: 'postgresql', tables: [TABLE], edges_table: null, label: 'Tasks' },
			{ workspace_id: WS2, db_id: DB, engine: 'postgresql', tables: [TABLE], edges_table: null, label: 'Tasks' },
		];
		const members = [
			{ workspace_id: WS, user_id: VIEWER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WS2, user_id: VIEWER, role: 'editor', permissions: ['create', 'read', 'update', 'delete'] },
		];
		const { answer } = await call(WRITE_ROUTES[0], VIEWER, { workspaces: [WS, WS2], mounts, members });
		assert.equal(answer.status, 200, answer.text);
		const { answer: refused } = await call(DDL_ROUTES[0], VIEWER, { workspaces: [WS, WS2], mounts, members });
		assert.equal(refused.status, 403, refused.text);
		assert.equal(refused.body.code, 'database_permission_denied');
	});
});
