/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mount-roles.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A mount linked to a workspace is readable by every member of it, and writable only by
// an editor, admin or owner: a viewer gets list/get/aggregate/schema/sql-ro/record reads,
// and 403 on insert/update/delete/upsert/batch/ddl/txn, before the query-router is called.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserSession, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const DB = 'f1f1f1f1-7777-4777-8777-f1f1f1f1f1f1';
const OTHER_TEAM = 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1';
const QUERY_ROUTER = 'http://query-router.local';
const config = harnessConfig();
const json = (body) => ({ method: 'POST', body: JSON.stringify(body) });

const READS = [
	['schema', `/api/databases/${DB}/schema`, {}],
	...['list', 'get', 'aggregate'].map((op) => [op, `/api/databases/${DB}/tables/tasks`, json({ op })]),
	['sql-ro', `/api/databases/${DB}/sql-ro`, json({ sql: 'select 1' })],
	['record read', `/api/records/${DB}/tasks/7`, {}],
];
const WRITES = [
	...['insert', 'update', 'delete', 'upsert', 'batch'].map((op) => [op, `/api/databases/${DB}/tables/tasks`, json({ op, data: { title: 'x' } })]),
	['ddl', `/api/databases/${DB}/schema/ddl`, json({ action: 'add_column', column: 'x', type: 'text' })],
	['txn', '/api/databases/txn', json({ mount: DB, ops: [{ op: 'insert', table: 'tasks', data: { title: 'x' } }] })],
];

/** The team links DB; B is a member with `role`. The query-router answers every call and logs it. */
function mountWorld(role, { failMembers = false } = {}) {
	const world = teamWorld({ memberRole: role === 'viewer' ? 'viewer' : 'editor' });
	world.osionos_workspace_members[1].role = role;
	world.osionos_workspace_databases = [{ workspace_id: IDS.team, db_id: DB, engine: 'postgresql', tables: ['tasks'], edges_table: null, label: 'Tasks' }];
	const mock = createPostgrestMock(world, {
		failWhen: (call) => (failMembers && call.table === 'osionos_workspace_members' ? { status: 503, body: { message: 'down' } } : null),
	});
	const routed = [];
	async function fetchImpl(url, init = {}) {
		if (String(url).startsWith(QUERY_ROUTER)) {
			routed.push(`${init.method ?? 'GET'} ${new URL(String(url)).pathname}`);
			return Response.json({ rows: [{ id: 7, title: 'Row seven' }], tables: [], affected_rows: 1 });
		}
		return mock.fetchImpl(url, init);
	}
	return { mock, routed, fetchImpl };
}

async function statusFor(role, [, path, init], headers = sessionHeaders(config, IDS.userB, IDS.homeB), options = {}) {
	const { fetchImpl, routed } = mountWorld(role, options);
	return withBridge(config, fetchImpl, async (base) => {
		const result = await send(base, path, headers, init);
		return { status: result.status, text: result.text, routed };
	});
}

let sqlRoBefore;
before(() => { sqlRoBefore = process.env.OSIONOS_SQL_RO; process.env.OSIONOS_SQL_RO = '1'; });
after(() => { if (sqlRoBefore === undefined) delete process.env.OSIONOS_SQL_RO; else process.env.OSIONOS_SQL_RO = sqlRoBefore; });

for (const role of ['owner', 'admin', 'editor', 'viewer']) {
	describe(`a workspace ${role}`, () => {
		for (const read of READS) {
			it(`may ${read[0]}`, async () => {
				const result = await statusFor(role, read);
				assert.equal(result.status, 200, result.text);
			});
		}
		for (const write of WRITES) {
			const allowed = role !== 'viewer';
			it(`${allowed ? 'may' : 'may not'} ${write[0]}`, async () => {
				const result = await statusFor(role, write);
				if (allowed) {
					assert.equal(result.status, 200, result.text);
					return;
				}
				assert.equal(result.status, 403, result.text);
				assert.match(JSON.parse(result.text).message, /read-only/);
				assert.deepEqual(result.routed, [], 'a refused write never reaches the query-router');
			});
		}
	});
}

describe('a user who is not a member of a linking workspace', () => {
	const outsider = 'e5e5e5e5-5555-4555-8555-e5e5e5e5e5e5';
	for (const op of [...READS, ...WRITES]) {
		it(`gets 403 on ${op[0]}`, async () => {
			const result = await statusFor('viewer', op, sessionHeaders(config, outsider, OTHER_TEAM));
			assert.equal(result.status, 403, result.text);
			assert.deepEqual(result.routed, []);
		});
	}
});

describe('where the role comes from', () => {
	it('takes the members row over a stale editor claim in the token', async () => {
		const payload = validateBridgePayload({ provider: 'prismatica', subject: IDS.userB, email: 'b@example.com', name: 'B', jti: 'e7c1d2a0-0000-4000-8000-0000000017b0' });
		const token = createUserSession(payload, config, { workspaceId: IDS.homeB }, Date.now(), [{ _id: IDS.team, role: 'editor' }]).session.accessToken;
		const result = await statusFor('viewer', WRITES[0], { authorization: `Bearer ${token}`, 'content-type': 'application/json' });
		assert.equal(result.status, 403, result.text);
	});

	it('lets a viewer of one linking workspace write through another where they are an editor', async () => {
		const { mock, routed } = mountWorld('viewer');
		mock.rows('osionos_workspace_members').push({ workspace_id: OTHER_TEAM, user_id: IDS.userB, role: 'editor', permissions: ['create', 'read', 'update'] });
		mock.rows('osionos_workspace_databases').push({ workspace_id: OTHER_TEAM, db_id: DB, engine: 'postgresql', tables: ['tasks'], edges_table: null, label: 'Tasks' });
		const fetchImpl = (url, init) => (String(url).startsWith(QUERY_ROUTER) ? (routed.push(String(url)), Promise.resolve(Response.json({ rows: [] }))) : mock.fetchImpl(url, init));
		await withBridge(config, fetchImpl, async (base) => {
			const result = await send(base, WRITES[0][1], sessionHeaders(config, IDS.userB, IDS.homeB), WRITES[0][2]);
			assert.equal(result.status, 200, result.text);
		});
	});

	it('answers 503, not 403, when the membership rows cannot be read', async () => {
		const result = await statusFor('editor', WRITES[0], undefined, { failMembers: true });
		assert.equal(result.status, 503, result.text);
		assert.deepEqual(result.routed, []);
	});
});
