/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mount-automations.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// O2: a live mount's server-side automation rules. One grobase tenant key serves every
// workspace, so the bridge's mount ACL is the only thing keeping workspace B out of
// workspace A's rules — every refusal below must happen before the query-router is called.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv } from '../../scripts/bridge-api.mjs';
import { createPostgrestMock, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const DB = 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0';
const WS_A = 'e0e0e0e0-2222-4222-8222-e0e0e0e0e0e0';
const WS_B = 'e1e1e1e1-2222-4222-8222-e1e1e1e1e1e1';
const OWNER = 'f0000000-1111-4111-8111-f000000000f0';
const EDITOR = 'f0000000-2222-4222-8222-f000000000f0';
const VIEWER = 'f0000000-3333-4333-8333-f000000000f0';
const NEIGHBOUR = 'f0000000-4444-4444-8444-f000000000f0';
const ROUTER = 'http://query-router.local';

const config = configFromEnv({
	OSIONOS_SESSION_CUTOFFS: 'off',
	OSIONOS_SESSION_RECORDS: 'off',
	OSIONOS_APP_URL: 'http://localhost:3001',
	OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
	OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
	OSIONOS_BAAS_URL: 'http://baas.local',
	KONG_SERVICE_API_KEY: 'service-role-test-key',
	OSIONOS_QUERY_ROUTER_URL: ROUTER,
	OSIONOS_BAAS_API_KEY: 'tenant-test-key',
});

const RULE = {
	id: 'r1', name: 'Flag big orders', enabled: true, trigger: 'row_created', table: 'orders',
	conditions: [], actions: [{ type: 'set_field', field: 'flag', value: 'big' }],
};

function world() {
	const mock = createPostgrestMock({
		osionos_workspace_members: [
			{ workspace_id: WS_A, user_id: OWNER, role: 'owner', permissions: [] },
			{ workspace_id: WS_A, user_id: EDITOR, role: 'editor', permissions: ['read', 'update'] },
			{ workspace_id: WS_A, user_id: VIEWER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WS_B, user_id: NEIGHBOUR, role: 'owner', permissions: [] },
		],
		osionos_workspace_databases: [{ workspace_id: WS_A, db_id: DB, engine: 'postgresql', tables: [], edges_table: null, label: 'Orders' }],
	}, { realWorkspaceRpc: true });
	const stored = { rules: [] };
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		if (!String(url).startsWith(ROUTER)) return mock.fetchImpl(url, init);
		calls.push({ url: String(url), method: init.method, apiKey: init.headers?.['X-Baas-Api-Key'] });
		if (init.method === 'PUT') stored.rules = JSON.parse(init.body).rules;
		return Response.json({ rules: stored.rules });
	};
	return { fetchImpl, calls };
}

async function asUser(made, userId, workspaces, init = {}) {
	const headers = sessionHeaders(config, userId, `a1000000-1111-4111-8111-a1000000${userId.slice(-4)}`, workspaces);
	return withBridge(config, made.fetchImpl, async (base) => send(base, `/api/databases/${DB}/automations`, headers, init));
}

const replaceWith = (rules) => ({ method: 'PUT', body: JSON.stringify({ rules }) });

describe('GET|PUT /api/databases/:dbId/automations', () => {
	it('round-trips a rule for the owner, with the tenant key', async () => {
		const made = world();
		const put = await asUser(made, OWNER, [WS_A], replaceWith([RULE]));
		assert.equal(put.status, 200, put.text);
		const got = await asUser(made, VIEWER, [WS_A]);
		assert.equal(got.status, 200, got.text);
		assert.deepEqual(got.body, { rules: [RULE] });
		assert.deepEqual(made.calls.map(({ method, url, apiKey }) => [method, url, apiKey]), [
			['PUT', `${ROUTER}/${DB}/automations`, 'tenant-test-key'],
			['GET', `${ROUTER}/${DB}/automations`, 'tenant-test-key'],
		]);
	});

	it('lets an editor read the rules but not replace them', async () => {
		const made = world();
		assert.equal((await asUser(made, EDITOR, [WS_A])).status, 200);
		const put = await asUser(made, EDITOR, [WS_A], replaceWith([RULE]));
		assert.equal(put.status, 403, put.text);
		assert.equal(put.body.code, 'database_permission_denied');
		assert.deepEqual(made.calls.map((call) => call.method), ['GET']);
	});

	it('keeps workspace B out of workspace A\'s rules, before the query-router', async () => {
		const made = world();
		const got = await asUser(made, NEIGHBOUR, [WS_B]);
		const put = await asUser(made, NEIGHBOUR, [WS_B], replaceWith([]));
		assert.equal(got.status, 403, got.text);
		assert.equal(put.status, 403, put.text);
		assert.deepEqual(made.calls, []);
	});

	it('refuses a body without a rules array, before the query-router', async () => {
		const made = world();
		const put = await asUser(made, OWNER, [WS_A], { method: 'PUT', body: JSON.stringify({ rules: 'all' }) });
		assert.equal(put.status, 422, put.text);
		assert.deepEqual(made.calls, []);
	});
});
