import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createRequestMeter, redactRoute } from '../../scripts/bridge-perf.mjs';

const BAAS = 'http://baas.local';
const uuid = '5cc30a3f-87e4-471d-b795-c936723081ee';
const workspaceId = 'e6f8f7f4-add7-473c-9e61-f8f20802ae91';
const dbId = '06f1603f-662e-4120-a62d-e605e23c2fe9';

function fakeResponse() {
	const response = new EventEmitter();
	response.headersSent = false;
	response.writeHead = (status) => { response.statusCode = status; response.headersSent = true; return response; };
	response.statusCode = 200;
	return response;
}

function build(enabled = true) {
	const lines = [];
	let clock = 0;
	const meter = createRequestMeter({ enabled, baasUrl: BAAS, now: () => (clock += 5), log: (line) => lines.push(line) });
	return { meter, lines };
}

async function serve(meter, request, handler) {
	const response = fakeResponse();
	await meter.track(request, response, async () => { await handler(response); response.writeHead(200); });
	response.emit('close');
	return response;
}

describe('request meter', () => {
	it('counts baas and other upstream calls separately', async () => {
		const { meter, lines } = build();
		const fetchImpl = meter.wrapFetch(async () => new Response('{}'));
		await serve(meter, { method: 'GET', url: '/api/x' }, async () => {
			await fetchImpl(`${BAAS}/rest/v1/a`);
			await fetchImpl(`${BAAS}/rest/v1/b`);
			await fetchImpl('http://other.local/q');
		});
		const entry = JSON.parse(lines[0]);
		assert.equal(entry.baas_n, 2);
		assert.equal(entry.up_n, 1);
		assert.equal(lines.length, 1);
	});

	it('keeps overlapping requests apart', async () => {
		const { meter, lines } = build();
		const gate = Promise.withResolvers();
		const fetchImpl = meter.wrapFetch(async (url) => { if (url.endsWith('/slow')) await gate.promise; return new Response('{}'); });
		const slow = serve(meter, { method: 'GET', url: '/slow' }, async () => {
			await fetchImpl(`${BAAS}/slow`);
			await fetchImpl(`${BAAS}/slow2`);
		});
		await serve(meter, { method: 'GET', url: '/fast' }, async () => { await fetchImpl(`${BAAS}/fast`); });
		gate.resolve();
		await slow;
		const byRoute = Object.fromEntries(lines.map((line) => JSON.parse(line)).map((entry) => [entry.route, entry.baas_n]));
		assert.deepEqual(byRoute, { '/fast': 1, '/slow': 2 });
	});

	it('is inert when disabled', async () => {
		const { meter, lines } = build(false);
		const raw = async () => new Response('{}');
		assert.equal(meter.wrapFetch(raw), raw);
		const response = await serve(meter, { method: 'GET', url: '/api/x' }, async () => {});
		assert.deepEqual(lines, []);
	});

	it('logs the route without query string or uuid', async () => {
		const { meter, lines } = build();
		await serve(meter, { method: 'GET', url: `/api/pages/${uuid}?workspaceId=${workspaceId}` }, async () => {});
		assert.equal(JSON.parse(lines[0]).route, '/api/pages/:x');
		assert.ok(!lines[0].includes('?'));
		assert.ok(!lines[0].includes(uuid));
		assert.ok(!lines[0].includes(workspaceId));
	});

	it('counts a rejected fetch and rethrows', async () => {
		const { meter, lines } = build();
		const boom = new Error('down');
		const fetchImpl = meter.wrapFetch(async () => { throw boom; });
		await serve(meter, { method: 'GET', url: '/x' }, async () => {
			await assert.rejects(fetchImpl(`${BAAS}/rest/v1/a`), boom);
		});
		assert.equal(JSON.parse(lines[0]).baas_n, 1);
	});

	it('never touches response headers', async () => {
		const { meter } = build();
		const response = fakeResponse();
		const original = response.writeHead;
		await meter.track({ method: 'GET', url: '/x' }, response, async () => {});
		assert.equal(response.writeHead, original);
	});

	it('templates every non-word segment and caps the route', async () => {
		const secrets = ['alice@example.com', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', '5cc30a3f87e4471db795c936723081ee', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'];
		for (const secret of secrets) {
			const route = redactRoute(`/api/public/pages/${secret}?q=1`);
			assert.ok(!route.includes(secret), route);
			assert.equal(route, '/api/public/pages/:x');
		}
		const email = redactRoute('/api/records/:id/users/alice@example.com');
		assert.ok(!email.includes('alice@example.com'), email);
		const long = redactRoute(`/${'a'.repeat(16_000)}`);
		assert.ok(long.length <= 120);
		assert.ok(!long.includes('aaaa'));
		assert.ok(redactRoute(`/${'a/'.repeat(8_000)}`).length <= 120);
		assert.equal(redactRoute('/api/pages/all'), '/api/pages/all');
		assert.equal(redactRoute('/api/workspaces'), '/api/workspaces');
		assert.equal(redactRoute(`/api/pages/${uuid}?workspaceId=${workspaceId}`), '/api/pages/:x');
	});

	it('classifies by origin, not by prefix', async () => {
		const lines = [];
		const meter = createRequestMeter({ enabled: true, baasUrl: 'https://grobase-stack.fly.dev', log: (line) => lines.push(line) });
		const fetchImpl = meter.wrapFetch(async () => new Response('{}'));
		await serve(meter, { method: 'GET', url: '/x' }, async () => {
			await fetchImpl('https://grobase-stack.fly.dev.evil.net/rest/v1/x');
			await fetchImpl('not a url');
			await fetchImpl('https://grobase-stack.fly.dev/rest/v1/x');
		});
		const entry = JSON.parse(lines[0]);
		assert.equal(entry.baas_n, 1);
		assert.equal(entry.up_n, 2);
	});

	it('logs status 0 for a request that never sent headers', async () => {
		const { meter, lines } = build();
		const response = fakeResponse();
		await meter.track({ method: 'GET', url: '/x' }, response, async () => {});
		response.emit('close');
		assert.equal(JSON.parse(lines[0]).status, 0);
	});
});

describe('meter in the bridge server', () => {
	it('reports the exact number of baas round trips the stub saw', async () => {
		const config = configFromEnv({
			OSIONOS_APP_URL: 'http://localhost:3001',
			OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
			OSIONOS_BAAS_URL: BAAS,
			KONG_SERVICE_API_KEY: 'service-role-test-key',
			KONG_PUBLIC_API_KEY: 'anon-test-key',
			OSIONOS_BAAS_API_KEY: 'tenant-api-key',
			OSIONOS_BAAS_TENANT_ID: 'agency',
		});
		let baasCalls = 0;
		const fetchImpl = async (input) => {
			const url = String(input);
			if (url.startsWith(BAAS)) baasCalls += 1;
			if (url.includes('osionos_workspace_databases')) return Response.json([{ id: uuid, workspace_id: workspaceId, db_id: dbId, engine: 'mssql', label: 'F' }]);
			return Response.json({ dbId, engine: 'mssql', tables: [] });
		};
		const lines = [];
		const server = createBridgeServer({ config, fetchImpl, perf: true, perfLog: (line) => lines.push(line) });
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { token } = signAppSessionToken({ payload: { subject: uuid, provider: 'test' }, workspace: { _id: workspaceId }, config });
		try {
			const response = await fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, { headers: { authorization: `Bearer ${token}` } });
			assert.equal(response.status, 200);
			assert.equal(response.headers.get('server-timing'), null);
			assert.ok(baasCalls >= 1);
			await new Promise((resolve) => setImmediate(resolve));
			console.info(`# sample perf line: ${lines[0]}`);
			const entry = JSON.parse(lines[0]);
			assert.equal(entry.baas_n, baasCalls);
			assert.equal(entry.status, 200);
			assert.equal(entry.route, '/api/databases/:x/schema');
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it('logs status 0 when the client aborts before the response', async () => {
		const config = configFromEnv({
			OSIONOS_APP_URL: 'http://localhost:3001',
			OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
			OSIONOS_BAAS_URL: BAAS,
			KONG_SERVICE_API_KEY: 'service-role-test-key',
			KONG_PUBLIC_API_KEY: 'anon-test-key',
			OSIONOS_BAAS_API_KEY: 'tenant-api-key',
			OSIONOS_BAAS_TENANT_ID: 'agency',
		});
		const gate = Promise.withResolvers();
		const lines = [];
		const server = createBridgeServer({ config, fetchImpl: () => gate.promise, perf: true, perfLog: (line) => lines.push(line) });
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { token } = signAppSessionToken({ payload: { subject: uuid, provider: 'test' }, workspace: { _id: workspaceId }, config });
		const controller = new AbortController();
		try {
			const pending = fetch(`http://127.0.0.1:${server.address().port}/api/databases/${dbId}/schema`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal }).catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, 50));
			controller.abort();
			await pending;
			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(JSON.parse(lines[0]).status, 0);
		} finally {
			gate.resolve(Response.json([]));
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
