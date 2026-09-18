/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-db-offline.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/16 22:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/16 22:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A workspace database whose engine is down must read as "engine offline" (503),
// not as a server fault (500). Measured before the fix: the MSSQL schema request
// hung for the bridge's full 2.5 s timeout, then surfaced the raw AbortError as
// `500 This operation was aborted`, which the database page rendered as a crash.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';

function offlineConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_QUERY_ROUTER_URL: 'http://query-router.local',
		OSIONOS_BAAS_API_KEY: 'tenant-api-key',
	});
}

function fetchWithDeadEngine(engineFailure) {
	return async (input) => {
		const url = String(input);
		if (url.startsWith('http://query-router.local')) throw engineFailure();
		if (url.includes('osionos_workspace_members')) return Response.json([]);
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ id: 'd21fec9c-7404-406a-8d4c-a8c25c6451c3', workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'Finance · MSSQL' }]);
		}
		return Response.json([]);
	};
}

async function schemaStatus(engineFailure) {
	const config = offlineConfig();
	const server = createBridgeServer({ config, fetchImpl: fetchWithDeadEngine(engineFailure) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		const started = Date.now();
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, {
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.status, body: await response.json(), elapsedMs: Date.now() - started };
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

describe('database schema when the engine is offline', () => {
	it('answers 503 with an explanation when the query-router call times out', async () => {
		const result = await schemaStatus(() => new DOMException('This operation was aborted', 'AbortError'));
		assert.equal(result.status, 503);
		assert.match(result.body.message, /not reachable|offline|did not answer/i);
		assert.doesNotMatch(result.body.message, /operation was aborted/i);
	});

	it('answers 503 when the query-router connection is refused', async () => {
		const result = await schemaStatus(() => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
		assert.equal(result.status, 503);
		assert.match(result.body.message, /not reachable|offline|did not answer/i);
	});
});
