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

// A workspace database whose engine is down must read as "engine offline", not as a
// server fault (500). Measured before the first fix: the MSSQL schema request hung for
// the bridge's full 2.5 s timeout, then surfaced the raw AbortError as
// `500 This operation was aborted`, which the database page rendered as a crash.
// It then answered 503, but a browser logs every non-2xx response as a console error,
// and the app reads every mount's schema on each load: the owner's offline Inception
// databases logged 18 errors per sweep (2026-11-04). An unreachable source is an
// expected state, so it is a 200 that says `unavailable`, and the client throws it as
// before (liveMountClient getLiveSchema).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';

function offlineConfig() {
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

function fetchWithDeadEngine(engineFailure, routerCalls = { count: 0 }) {
	return async (input) => {
		const url = String(input);
		if (url.startsWith('http://query-router.local')) {
			routerCalls.count += 1;
			throw engineFailure();
		}
		if (url.includes('osionos_workspace_members')) return Response.json([]);
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ id: 'd21fec9c-7404-406a-8d4c-a8c25c6451c3', workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'Finance · MSSQL' }]);
		}
		return Response.json([]);
	};
}

async function schemaStatus(engineFailure, { reads = 1, routerCalls = { count: 0 } } = {}) {
	const config = offlineConfig();
	const server = createBridgeServer({ config, fetchImpl: fetchWithDeadEngine(engineFailure, routerCalls) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		let result;
		for (let read = 0; read < reads; read += 1) {
			const started = Date.now();
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, {
				headers: { authorization: `Bearer ${token}` },
			});
			result = { status: response.status, body: await response.json(), elapsedMs: Date.now() - started };
		}
		return result;
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

describe('database schema when the engine is offline', () => {
	it('answers 200 unavailable with an explanation when the query-router call times out', async () => {
		const result = await schemaStatus(() => new DOMException('This operation was aborted', 'AbortError'));
		assert.equal(result.status, 200);
		assert.equal(result.body.unavailable, true);
		assert.deepEqual(result.body.tables, []);
		assert.match(result.body.message, /not reachable|offline|did not answer/i);
		assert.doesNotMatch(result.body.message, /operation was aborted/i);
	});

	it('answers 200 unavailable when the query-router connection is refused', async () => {
		const result = await schemaStatus(() => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
		assert.equal(result.status, 200);
		assert.equal(result.body.unavailable, true);
		assert.match(result.body.message, /not reachable|offline|did not answer/i);
	});

	it('remembers an unreachable source briefly, so the next read does not wait again', async () => {
		const routerCalls = { count: 0 };
		const result = await schemaStatus(() => new DOMException('This operation was aborted', 'AbortError'), { reads: 3, routerCalls });
		assert.equal(result.body.unavailable, true);
		assert.equal(routerCalls.count, 1, `the query-router was asked ${routerCalls.count} times for 3 reads`);
	});
});
