/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-database-probe.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 03:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 03:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';

function probeConfig() {
	return configFromEnv({
		OSIONOS_SESSION_CUTOFFS: 'off',
		OSIONOS_SESSION_RECORDS: 'off',
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_QUERY_ROUTER_URL: 'http://query-router.local',
		OSIONOS_BAAS_API_KEY: 'tenant-api-key',
	});
}

function fetchWithProbe(probeResponse, calls, member = null) {
	return async (input) => {
		const url = String(input);
		if (url.startsWith('http://query-router.local')) {
			calls.push(url);
			return probeResponse();
		}
		if (url.includes('osionos_workspace_members')) {
			return Response.json(member ? [{ ...member, user_id: userId, workspace_id: workspaceId }] : []);
		}
		if (url.includes('rpc/osionos_bridge_list_workspaces')) {
			return Response.json(member ? [{ workspace_id: workspaceId, workspace_role: member.role, permissions: member.permissions }] : []);
		}
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ workspace_id: workspaceId, db_id: dbId, engine: 'postgresql', label: 'Finance' }]);
		}
		return Response.json([]);
	};
}

async function requestDatabase(route, probeResponse, member = null) {
	const config = probeConfig();
	const calls = [];
	const server = createBridgeServer({ config, fetchImpl: fetchWithProbe(probeResponse, calls, member) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/${route}`, {
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.status, body: await response.json(), calls };
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

function probe(answer, status = 200) {
	return () => Response.json(answer, { status });
}

describe('database live-mount probe', () => {
	it('allowlists the engine version and TLS fields from a successful upstream probe', async () => {
		const result = await requestDatabase('probe', probe({
			dbId,
			engine: 'postgresql',
			server_version: '16.4',
			tls: 'verified',
			tls_version: 'TLSv1.3',
			connection_string: 'postgres://x',
		}));
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, {
			dbId,
			available: true,
			engine: 'postgresql',
			server_version: '16.4',
			tls: 'verified',
			tls_version: 'TLSv1.3',
		});
		assert.equal(Object.hasOwn(result.body, 'connection_string'), false);
	});

	it('maps an upstream 404 to an ordinary unavailable probe', async () => {
		const result = await requestDatabase('probe', probe({ message: 'probe disabled' }, 404));
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { dbId, available: false });
	});

	it('maps an upstream 429 to an unavailable probe with a retry hint', async () => {
		const result = await requestDatabase('probe', probe({ message: 'rate limited' }, 429));
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { dbId, available: false, retryAfter: 1 });
	});

	it('uses the schema read gate and never probes for a member without read permission', async () => {
		const member = { role: 'viewer', permissions: [] };
		const schema = await requestDatabase('schema', probe({ tables: [] }), member);
		const result = await requestDatabase('probe', probe({ engine: 'postgresql' }), member);
		assert.equal(result.status, schema.status);
		assert.deepEqual(result.calls, []);
	});
});
