// Behind a groot link only Kong is relayed: mini-baas-query-router does not resolve, so every
// record, schema and data-graph call failed and the graph showed notes only (measured on the
// b2b data center link, 2026-10-11: 367 nodes, none from a database). The bridge now reaches
// query-router on Kong's /query/v1, which refuses a request without the anon key (401
// "No API key found in request"), so every query-router call carries it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';

const baseEnv = {
	OSIONOS_APP_URL: 'http://localhost:3001',
	OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
	OSIONOS_BAAS_URL: 'http://baas.local',
	KONG_SERVICE_API_KEY: 'service-role-test-key',
	KONG_PUBLIC_API_KEY: 'anon-test-key',
	OSIONOS_BAAS_API_KEY: 'tenant-api-key',
};

/** Answers the workspace lookups; records every request that reaches `routerPrefix`. */
function recordingFetch(routerPrefix, seen) {
	return async (input, init = {}) => {
		const url = String(input);
		if (url.startsWith(routerPrefix)) {
			seen.push({ url, headers: new Headers(init.headers) });
			return Response.json({ dbId, engine: 'mssql', tables: [] });
		}
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ id: 'd21fec9c-7404-406a-8d4c-a8c25c6451c3', workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'Finance · MSSQL' }]);
		}
		return Response.json([]);
	};
}

async function schemaThrough(env, routerPrefix) {
	const config = configFromEnv(env);
	const seen = [];
	const server = createBridgeServer({ config, fetchImpl: recordingFetch(routerPrefix, seen) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, {
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.status, seen };
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

describe('query-router through Kong', () => {
	it('sends the tenant key and the anon key to the configured /query/v1 route', async () => {
		const prefix = 'http://mini-baas-kong:8000/query/v1';
		const { status, seen } = await schemaThrough({ ...baseEnv, OSIONOS_QUERY_ROUTER_URL: `${prefix}/` }, prefix);
		assert.equal(status, 200);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].url, `${prefix}/${dbId}/schema`);
		assert.equal(seen[0].headers.get('x-baas-api-key'), 'tenant-api-key');
		assert.equal(seen[0].headers.get('apikey'), 'anon-test-key');
	});

	it('sends no apikey header when no anon key is configured', async () => {
		const prefix = 'http://mini-baas-query-router:4001';
		const { KONG_PUBLIC_API_KEY: _unused, ...withoutAnon } = baseEnv;
		const { status, seen } = await schemaThrough(withoutAnon, prefix);
		assert.equal(status, 200);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].headers.has('apikey'), false);
		assert.equal(seen[0].headers.get('x-baas-api-key'), 'tenant-api-key');
	});

	it('treats a blank OSIONOS_QUERY_ROUTER_URL as unset: the container-DNS default', () => {
		assert.equal(configFromEnv({ ...baseEnv, OSIONOS_QUERY_ROUTER_URL: '' }).queryRouterUrl, 'http://mini-baas-query-router:4001');
		assert.equal(configFromEnv(baseEnv).queryRouterUrl, 'http://mini-baas-query-router:4001');
	});
});
