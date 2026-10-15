// Behind a groot link only Kong is relayed: mini-baas-query-router and the adapter-registry do
// not resolve, so every record, schema and data-graph call failed and the graph showed notes
// only (measured on the b2b data center link, 2026-10-11: 367 nodes, none from a database), and
// the database list failed. The bridge now reaches query-router on Kong's /query/v1, which
// refuses a request without the anon key (401 "No API key found in request"), and the registry
// on Kong's /admin/v1, which admits the service key alone (the anon key gets 403).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const userId = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';
const otherDbId = 'bd63e1f9-6ef5-433f-8134-017a3711fc17';

const baseEnv = {
	OSIONOS_APP_URL: 'http://localhost:3001',
	OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
	OSIONOS_BAAS_URL: 'http://baas.local',
	KONG_SERVICE_API_KEY: 'service-role-test-key',
	KONG_PUBLIC_API_KEY: 'anon-test-key',
	OSIONOS_BAAS_API_KEY: 'tenant-api-key',
	OSIONOS_BAAS_TENANT_ID: 'agency',
};

/** Answers the workspace lookups; records every request that reaches `upstreamPrefix`. The
 *  registry lists one database outside the caller's workspaces, which the bridge must drop. */
function recordingFetch(upstreamPrefix, seen) {
	return async (input, init = {}) => {
		const url = String(input);
		if (url.startsWith(upstreamPrefix)) {
			seen.push({ url, headers: new Headers(init.headers) });
			if (url.endsWith('/databases') || url.endsWith('/me/mounts')) return Response.json([{ id: dbId, name: 'osionos-finance', engine: 'mssql' }, { id: otherDbId, name: 'osionos-iot', engine: 'dynamodb' }]);
			return Response.json({ dbId, engine: 'mssql', tables: [] });
		}
		if (url.includes('osionos_workspace_databases')) {
			return Response.json([{ id: 'd21fec9c-7404-406a-8d4c-a8c25c6451c3', workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'Finance · MSSQL' }]);
		}
		return Response.json([]);
	};
}

async function bridgeGet(env, upstreamPrefix, path) {
	const config = configFromEnv(env);
	const seen = [];
	const server = createBridgeServer({ config, fetchImpl: recordingFetch(upstreamPrefix, seen) });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.status, body: await response.json(), seen };
	} finally {
		await new Promise((resolveClose) => server.close(resolveClose));
	}
}

describe('query-router through Kong', () => {
	it('sends the tenant key and the anon key to the configured /query/v1 route', async () => {
		const prefix = 'http://mini-baas-kong:8000/query/v1';
		const { status, seen } = await bridgeGet({ ...baseEnv, OSIONOS_QUERY_ROUTER_URL: `${prefix}/` }, prefix, `/api/databases/${dbId}/schema`);
		assert.equal(status, 200);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].url, `${prefix}/${dbId}/schema`);
		assert.equal(seen[0].headers.get('x-baas-api-key'), 'tenant-api-key');
		assert.equal(seen[0].headers.get('apikey'), 'anon-test-key');
	});

	it('sends no apikey header when no anon key is configured', async () => {
		const prefix = 'http://mini-baas-query-router:4001';
		const { KONG_PUBLIC_API_KEY: _unused, ...withoutAnon } = baseEnv;
		const { status, seen } = await bridgeGet(withoutAnon, prefix, `/api/databases/${dbId}/schema`);
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

describe('adapter-registry through Kong', () => {
	it('lists the caller\'s databases through /admin/v1 with the service key and the tenant headers', async () => {
		const prefix = 'http://mini-baas-kong:8000/admin/v1';
		const { status, body, seen } = await bridgeGet({ ...baseEnv, OSIONOS_ADAPTER_REGISTRY_URL: `${prefix}/` }, prefix, '/api/databases');
		assert.equal(status, 200);
		assert.deepEqual(body.databases, [{ dbId, name: 'osionos-finance', engine: 'mssql' }]);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].url, `${prefix}/databases`);
		assert.equal(seen[0].headers.get('apikey'), 'service-role-test-key');
		assert.equal(seen[0].headers.get('x-baas-tenant-id'), 'agency');
		assert.equal(seen[0].headers.get('x-baas-user-id'), 'agency');
	});

	it('keeps the bridge\'s own tenant when the client hints another: the service key never serves it', async () => {
		const prefix = 'http://mini-baas-kong:8000/admin/v1';
		const { status, seen } = await bridgeGet({ ...baseEnv, OSIONOS_ADAPTER_REGISTRY_URL: prefix }, prefix, '/api/databases?tenant=other');
		assert.equal(status, 200);
		assert.equal(seen.length, 1);
		assert.equal(seen[0].headers.get('x-baas-tenant-id'), 'agency');
		assert.equal(seen[0].headers.get('x-baas-user-id'), 'agency');
	});

	it('treats a blank OSIONOS_ADAPTER_REGISTRY_URL as unset: the container-DNS default', () => {
		assert.equal(configFromEnv({ ...baseEnv, OSIONOS_ADAPTER_REGISTRY_URL: '' }).adapterRegistryUrl, 'http://mini-baas-adapter-registry-go:3021');
		assert.equal(configFromEnv(baseEnv).adapterRegistryUrl, 'http://mini-baas-adapter-registry-go:3021');
	});
});

// Over Tailscale Funnel the grobase WAF refuses /admin/v1 (rule 10130: the service key alone
// would open admin routes from the internet), so a link reached that way lists the tenant's
// mounts on the self-serve route with the tenant api-key, which carries the tenant itself.
describe('tenant mount list through Kong', () => {
	const mountsUrl = 'http://mini-baas-kong:8000/v1/tenants/me/mounts';
	const env = { ...baseEnv, OSIONOS_TENANT_MOUNTS_URL: mountsUrl, OSIONOS_ADAPTER_REGISTRY_URL: 'http://mini-baas-kong:8000/admin/v1' };

	/** The bridge in front of a mount route that answers `status`; records every upstream URL. */
	async function listWithMountRouteAnswering(status) {
		const config = configFromEnv(env);
		const seen = [];
		const fetchImpl = async (input) => {
			const url = String(input);
			seen.push(url);
			if (url === mountsUrl) return new Response('{"error":"refused"}', { status });
			return Response.json([{ id: 'd21fec9c-7404-406a-8d4c-a8c25c6451c3', workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'Finance · MSSQL' }]);
		};
		const server = createBridgeServer({ config, fetchImpl });
		await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
		const { token } = signAppSessionToken({ payload: { subject: userId, provider: 'test' }, workspace: { _id: workspaceId }, config });
		try {
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases`, { headers: { authorization: `Bearer ${token}` } });
			return { status: response.status, body: await response.json(), seen };
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	}

	it('lists the caller\'s databases with the tenant key as a bearer and never calls the registry', async () => {
		const { status, body, seen } = await bridgeGet(env, 'http://mini-baas-kong:8000/', '/api/databases');
		assert.equal(status, 200);
		assert.deepEqual(body.databases, [{ dbId, name: 'osionos-finance', engine: 'mssql' }]);
		assert.deepEqual(seen.map((request) => request.url), [mountsUrl]);
		assert.equal(seen[0].headers.get('authorization'), 'Bearer tenant-api-key');
		assert.equal(seen[0].headers.has('apikey'), false);
		assert.equal(seen[0].headers.has('x-api-key'), false);
		assert.equal(seen[0].headers.has('x-baas-tenant-id'), false);
		assert.equal([...seen[0].headers.values()].some((value) => value.includes('service-role-test-key')), false);
	});

	it('ignores a client tenant hint: the key decides the tenant', async () => {
		const { status, seen } = await bridgeGet(env, 'http://mini-baas-kong:8000/', '/api/databases?tenant=other');
		assert.equal(status, 200);
		assert.deepEqual(seen.map((request) => request.url), [mountsUrl]);
	});

	it('answers 503 naming the route when grobase has no tenant mount route (404), and never falls back', async () => {
		const { status, body, seen } = await listWithMountRouteAnswering(404);
		assert.equal(status, 503);
		assert.match(body.message, /\/v1\/tenants\/me\/mounts/);
		assert.equal(body.databases, undefined);
		assert.equal(seen.filter((url) => url.includes('/admin/v1')).length, 0);
	});

	for (const refused of [401, 403]) {
		it(`answers 403 when grobase refuses the key (${refused})`, async () => {
			const { status, body, seen } = await listWithMountRouteAnswering(refused);
			assert.equal(status, 403);
			assert.equal(body.databases, undefined);
			assert.equal(seen.filter((url) => url.includes('/admin/v1')).length, 0);
		});
	}

	it('answers 503 "rate limited" on a 429 from the shared self-serve bucket', async () => {
		const { status, body } = await listWithMountRouteAnswering(429);
		assert.equal(status, 503);
		assert.match(body.message, /rate limited/);
		assert.equal(body.databases, undefined);
	});

	it('answers 503 when no tenant api key is configured', async () => {
		const { OSIONOS_BAAS_API_KEY: _unused, ...withoutKey } = env;
		const { status, seen } = await bridgeGet(withoutKey, 'http://mini-baas-kong:8000/', '/api/databases');
		assert.equal(status, 503);
		assert.equal(seen.length, 0);
	});

	it('treats a blank OSIONOS_TENANT_MOUNTS_URL as unset: the registry path', () => {
		assert.equal(configFromEnv({ ...baseEnv, OSIONOS_TENANT_MOUNTS_URL: '  ' }).tenantMountsUrl, '');
		assert.equal(configFromEnv(baseEnv).tenantMountsUrl, '');
	});
});
