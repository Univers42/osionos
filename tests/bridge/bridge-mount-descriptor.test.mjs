/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mount-descriptor.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 21:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 06:30:00 by dlesieur         ###   ########.fr       */
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
const CAPABILITIES_URL = 'http://query-router.local/capabilities';
const PG_CAPS = {
	read: true, write: true, upsert: true, batch: true, aggregate: true, introspect: true,
	schema_ddl: true, stream: true, ddl: true, transactions: true, latency_class: 'low',
};
const capabilitiesOk = () => Response.json({ router: 'rust', engines: [{ engine: 'postgresql', phase: 'pool_v2_active', capabilities: PG_CAPS }] });

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

function world(upstream = () => Response.json({ ...DESCRIPTOR, future_field: 'unreviewed' }), capabilities = capabilitiesOk) {
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
		if (String(url) === CAPABILITIES_URL) {
			calls.push({ url: String(url) });
			return capabilities();
		}
		return mock.fetchImpl(url, init);
	};
	return { fetchImpl, calls };
}

// Each call gets its own config: the bridge caches the capability payload per config.
async function describeAs(userId, { workspaces = [WS], path = `/api/databases/${DB}/descriptor`, upstream, capabilities } = {}) {
	const made = world(upstream, capabilities);
	const fresh = { ...config };
	const headers = sessionHeaders(fresh, userId, `a1000000-1111-4111-8111-a1000000${userId.slice(-4)}`, workspaces);
	const answer = await withBridge(fresh, made.fetchImpl, async (base) => send(base, path, headers));
	return { answer, calls: made.calls };
}

describe('GET /api/databases/:dbId/descriptor', () => {
	const PG_FLAGS = { read: true, write: true, upsert: true, batch: true, aggregate: true, introspect: true, schema_ddl: true, transactions: true };

	it('relays the known keys and the engine\'s closed flag set for a member who may read', async () => {
		const { answer, calls } = await describeAs(VIEWER);
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(answer.body, { dbId: DB, descriptor: { ...DESCRIPTOR, capabilities: PG_FLAGS } });
		assert.deepEqual(calls, [
			{ url: `${MOUNTS_URL}/${DB}/descriptor`, authorization: 'Bearer tenant-test-key' },
			{ url: CAPABILITIES_URL },
		]);
	});

	it('drops a flag that is not a boolean and omits capabilities for an engine the data plane does not list', async () => {
		const odd = () => Response.json({ engines: [{ engine: 'postgresql', capabilities: { ...PG_CAPS, write: 'yes' } }] });
		const { answer } = await describeAs(VIEWER, { capabilities: odd });
		const { write: _write, ...rest } = PG_FLAGS;
		assert.deepEqual(answer.body.descriptor.capabilities, rest);
		const missing = () => Response.json({ engines: [{ engine: 'mongodb', capabilities: PG_CAPS }] });
		const other = await describeAs(VIEWER, { capabilities: missing });
		assert.equal(other.answer.status, 200, other.answer.text);
		assert.equal('capabilities' in other.answer.body.descriptor, false);
	});

	it('still answers the descriptor when the query-router cannot list capabilities', async () => {
		const { answer } = await describeAs(VIEWER, { capabilities: () => new Response('down', { status: 502 }) });
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(answer.body, { dbId: DB, descriptor: DESCRIPTOR });
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
