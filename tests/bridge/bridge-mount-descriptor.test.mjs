/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mount-descriptor.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 21:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 21:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// G4: the descriptor names where a mount's data lives. grobase answers for the whole
// tenant, so the bridge must gate it on the CALLER's membership in a workspace that
// mounts the database (the same read gate as the schema), and must pass on only the
// descriptor's known keys.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv } from '../../scripts/bridge-api.mjs';
import { createPostgrestMock, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const DB = 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0';
const WS = 'e0e0e0e0-2222-4222-8222-e0e0e0e0e0e0';
const VIEWER = 'f0000000-3333-4333-8333-f000000000f0';
const NOROAD = 'f0000000-4444-4444-8444-f000000000f0';
const OUTSIDER = 'f0000000-5555-4555-8555-f000000000f0';
const MOUNTS_URL = 'http://tenant-control.local/v1/tenants/me/mounts';

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
	OSIONOS_TENANT_MOUNTS_URL: MOUNTS_URL,
});

const DESCRIPTOR = {
	id: DB, name: 'Tasks', engine: 'postgresql', isolation: 'schema', credential_mode: 'inline',
	location: 'network', host: 'db.acme.io', port: 5432, database: 'shop', tls: 'verify',
	created_at: '2026-10-29T00:00:00Z', last_healthy_at: null,
};

function world(upstream = () => Response.json({ ...DESCRIPTOR, future_field: 'unreviewed' })) {
	const mock = createPostgrestMock({
		osionos_workspace_members: [
			{ workspace_id: WS, user_id: VIEWER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WS, user_id: NOROAD, role: 'viewer', permissions: [] },
		],
		osionos_workspace_databases: [{ workspace_id: WS, db_id: DB, engine: 'postgresql', tables: [], edges_table: null, label: 'Tasks' }],
	}, { realWorkspaceRpc: true });
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		if (String(url).startsWith(MOUNTS_URL)) {
			calls.push({ url: String(url), authorization: init.headers?.Authorization });
			return upstream();
		}
		return mock.fetchImpl(url, init);
	};
	return { fetchImpl, calls };
}

async function describeAs(userId, { workspaces = [WS], path = `/api/databases/${DB}/descriptor`, upstream } = {}) {
	const made = world(upstream);
	const headers = sessionHeaders(config, userId, `a1000000-1111-4111-8111-a1000000${userId.slice(-4)}`, workspaces);
	const answer = await withBridge(config, made.fetchImpl, async (base) => send(base, path, headers));
	return { answer, calls: made.calls };
}

describe('GET /api/databases/:dbId/descriptor', () => {
	it('relays the known keys for a member who may read, with the tenant key', async () => {
		const { answer, calls } = await describeAs(VIEWER);
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(answer.body, { dbId: DB, descriptor: DESCRIPTOR });
		assert.deepEqual(calls, [{ url: `${MOUNTS_URL}/${DB}/descriptor`, authorization: 'Bearer tenant-test-key' }]);
	});

	it('refuses a member who may not read, before grobase', async () => {
		const { answer, calls } = await describeAs(NOROAD);
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.code, 'database_read_denied');
		assert.deepEqual(calls, []);
	});

	it('refuses a caller whose workspaces do not mount the database, before grobase', async () => {
		const { answer, calls } = await describeAs(OUTSIDER, { workspaces: [] });
		assert.equal(answer.status, 403, answer.text);
		assert.deepEqual(calls, []);
	});

	it('refuses an id that is not a UUID, before grobase', async () => {
		const { answer, calls } = await describeAs(VIEWER, { path: '/api/databases/x%2F..%2Fmounts/descriptor' });
		assert.equal(answer.status, 422, answer.text);
		assert.deepEqual(calls, []);
	});

	it('answers 404 when grobase has no descriptor (an older tenant-control)', async () => {
		const { answer } = await describeAs(VIEWER, { upstream: () => new Response('not found', { status: 404 }) });
		assert.equal(answer.status, 404, answer.text);
	});
});
