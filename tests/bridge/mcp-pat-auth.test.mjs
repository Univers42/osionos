/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-pat-auth.test.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P5-2-b: the MCP stdio server acts as a personal access token and nothing else.
 *
 * The client half is driven as a module with a fake fetch; the server half is spawned
 * against a fake bridge, the way bridge-mcp-archive.test.mjs does. Every token here is
 * minted by the test: no real secret is read.
 *
 * Caveat: the source guard is a substring check, blind to a literal split in two; the
 * spawned cases are its behavioural half.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { createMcpApiClient } from '../../scripts/osionos-mcp-api.mjs';
import { PAT_ROUTES } from '../../scripts/bridge-pat-middleware.mjs';

const API = 'http://api.test';
const PATH = '/api/workspaces';
const MISSING_TEXT = 'Set OSIONOS_MCP_TOKEN to a personal access token (Settings → Developer → New token).';
const fakePat = () => `osio_pat_${randomBytes(32).toString('base64url')}`;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const savedEnv = { token: process.env.OSIONOS_MCP_TOKEN, jwt: process.env.OSIONOS_MCP_JWT };
test.beforeEach(() => {
	delete process.env.OSIONOS_MCP_TOKEN;
	delete process.env.OSIONOS_MCP_JWT;
});
test.after(() => {
	for (const [key, name] of [['token', 'OSIONOS_MCP_TOKEN'], ['jwt', 'OSIONOS_MCP_JWT']]) {
		if (savedEnv[key] === undefined) delete process.env[name];
		else process.env[name] = savedEnv[key];
	}
});

/** A client over a fake fetch that answers `reply`, with every fetch and mint recorded. */
function client(reply) {
	const calls = [];
	const mints = [];
	const api = createMcpApiClient({
		fetchImpl: async (url, init) => {
			calls.push({ url: String(url), authorization: init?.headers?.Authorization });
			return reply();
		},
		resolveApiUrl: async () => API,
		mintSession: async () => {
			mints.push(1);
			return { accessToken: 'minted', expiresAt: Date.now() + 600_000 };
		},
	});
	return { api, calls, mints };
}

/** Everything console.error writes while `run` is awaited. */
async function loggedDuring(run) {
	const lines = [];
	const original = console.error;
	console.error = (...args) => lines.push(args.map(String).join(' '));
	try {
		await run();
	} catch (error) {
		void error;
	} finally {
		console.error = original;
	}
	return lines.join('\n');
}

test('the bearer is the personal access token, and no session is ever minted', async () => {
	const token = fakePat();
	process.env.OSIONOS_MCP_TOKEN = token;
	const { api, calls, mints } = client(() => json(200, []));
	await api.request(PATH);
	await api.request(PATH);
	assert.deepEqual(calls.map((call) => call.authorization), [`Bearer ${token}`, `Bearer ${token}`]);
	assert.equal(mints.length, 0);
});

test('the token wins over a JWT in the environment', async () => {
	const token = fakePat();
	process.env.OSIONOS_MCP_TOKEN = token;
	process.env.OSIONOS_MCP_JWT = 'a.b.c';
	const { api, calls } = client(() => json(200, []));
	await api.request(PATH);
	assert.equal(calls[0].authorization, `Bearer ${token}`);
});

test('a malformed token is refused by name, with no request and no value in the text or the log', async () => {
	const bad = 'osio_pat_too-short';
	process.env.OSIONOS_MCP_TOKEN = bad;
	const { api, calls, mints } = client(() => json(200, []));
	let message = '';
	const logged = await loggedDuring(() => api.request(PATH).catch((error) => { message = error.message; throw error; }));
	assert.match(message, /OSIONOS_MCP_TOKEN/);
	assert.equal(message.includes(bad), false);
	assert.equal(logged.includes(bad), false);
	assert.equal(calls.length, 0);
	assert.equal(mints.length, 0);
});

test('a well-formed but wrong token is refused by the bridge once, and its value never surfaces', async () => {
	const token = fakePat();
	process.env.OSIONOS_MCP_TOKEN = token;
	const { api, calls } = client(() => json(401, { error: 'pat_invalid' }));
	let message = '';
	const logged = await loggedDuring(() => api.request(PATH).catch((error) => { message = error.message; throw error; }));
	assert.equal(calls.length, 1);
	assert.equal(message.includes(token), false);
	assert.equal(logged.includes(token), false);
});

test('no credential: the instruction text, zero fetches and zero mints', async () => {
	const calls = [];
	const mints = [];
	const api = createMcpApiClient({
		fetchImpl: async (url) => { calls.push(String(url)); return json(200, []); },
		resolveApiUrl: async () => { calls.push('resolve'); return API; },
	});
	await assert.rejects(() => api.request(PATH), { message: MISSING_TEXT });
	assert.deepEqual(calls, []);
	assert.deepEqual(mints, []);
});

const REFUSALS = [
	[401, 'pat_invalid', /Create a new token in Settings → Developer/],
	[503, 'pat_unavailable', /try again/],
	[403, 'pat_route_not_allowed', /may not use this route/],
	[403, 'pat_scope_denied', /permissions do not include this/],
	[403, 'pat_forbidden_attribute', /may not change those fields/],
	[403, 'pat_no_workspace', /has no workspace/],
];
for (const [status, code, text] of REFUSALS) {
	test(`${status} ${code} is one fetch and a plain hint read from error.body.error`, async () => {
		process.env.OSIONOS_MCP_TOKEN = fakePat();
		const { api, calls } = client(() => json(status, { error: code }));
		await assert.rejects(() => api.request(PATH), (error) => {
			assert.match(error.message, text);
			assert.equal(error.status, status);
			return true;
		});
		assert.equal(calls.length, 1);
	});
}

test('the two MCP sources hold no HMAC, dev secret, identity variable or env-file reader', () => {
	const forbidden = [
		'dev-secret-change-in-production', 'createHmac', 'createHash', 'X-Prismatica-Bridge-Signature',
		'OSIONOS_BRIDGE_SHARED_SECRET', 'JWT_SECRET', 'OSIONOS_MCP_BRIDGE_SECRET', 'OSIONOS_MCP_SUBJECT',
		'OSIONOS_MCP_EMAIL', 'OSIONOS_MCP_NAME', 'bridge/session', 'claude.mcp@osionos.local', 'readFileSync',
	];
	for (const file of ['scripts/osionos-mcp-server.mjs', 'scripts/osionos-mcp-api.mjs']) {
		const source = readFileSync(file, 'utf8');
		for (const word of forbidden) assert.equal(source.includes(word), false, `${file} contains ${word}`);
	}
});

test('a malformed OSIONOS_MCP_TOKEN stops the server at startup, naming the variable and not the value', () => {
	const bad = 'osio_pat_not-a-real-one';
	const run = spawnSync('node', ['scripts/osionos-mcp-server.mjs'], {
		env: { PATH: process.env.PATH, OSIONOS_MCP_TOKEN: bad },
		encoding: 'utf8',
		timeout: 15_000,
		input: '',
	});
	assert.notEqual(run.status, 0);
	assert.match(run.stderr, /OSIONOS_MCP_TOKEN/);
	assert.equal((run.stderr + run.stdout).includes(bad), false);
});

/** A fake bridge that records every request, and a connected MCP client over the real server. */
async function spawnServer(extraEnv) {
	const requests = [];
	const bridge = http.createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			const path = req.url.split('?')[0];
			requests.push({ method: req.method, path, authorization: req.headers.authorization });
			res.setHeader('content-type', 'application/json');
			if (path === '/api/auth/bridge/health') return res.end(JSON.stringify({ service: 'osionos-bridge' }));
			if (path === '/api/workspaces') return res.end(JSON.stringify([{ _id: 'w1', name: 'W' }]));
			if (path === '/api/pages/all') return res.end('[]');
			return res.end(JSON.stringify({ _id: 'p', title: 'T', content: [] }));
		});
	});
	await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${bridge.address().port}`;
	const transport = new StdioClientTransport({
		command: 'node',
		args: ['scripts/osionos-mcp-server.mjs'],
		env: { PATH: process.env.PATH, OSIONOS_MCP_BRIDGE_URL: url, OSIONOS_MCP_API_URL: url, ...extraEnv },
		stderr: 'pipe',
		cwd: process.cwd(),
	});
	let stderr = '';
	const mcp = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
	await mcp.connect(transport);
	transport.stderr?.on('data', (chunk) => { stderr += chunk; });
	const close = async () => {
		await mcp.close().catch(() => {});
		await new Promise((resolve) => bridge.close(resolve));
	};
	return { mcp, requests, close, stderr: () => stderr };
}

const PAGE = randomUUID();
const TOOL_CALLS = [
	['osionos_describe_app', {}],
	['osionos_list_workspaces', {}],
	['osionos_list_pages', { workspaceId: 'w1' }],
	['osionos_search_pages', { query: 'x' }],
	['osionos_read_page', { pageId: PAGE }],
	['osionos_create_page', { workspaceId: 'w1', title: 'T', text: 'hello' }],
	['osionos_update_page', { pageId: PAGE, title: 'T2' }],
	['osionos_append_to_page', { pageId: PAGE, text: 'more' }],
	['osionos_archive_page', { pageId: PAGE }],
];

test('with a token, every tool sends only the token, only to a PAT route, and impersonation variables change nothing', async () => {
	const token = fakePat();
	const server = await spawnServer({
		OSIONOS_MCP_TOKEN: token,
		OSIONOS_MCP_EMAIL: 'admin@x.test',
		OSIONOS_MCP_SUBJECT: randomUUID(),
		OSIONOS_BRIDGE_SHARED_SECRET: 'some-shared-secret',
	});
	try {
		for (const [name, args] of TOOL_CALLS) {
			const result = await server.mcp.callTool({ name, arguments: args });
			assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result.content)}`);
		}
		const authed = server.requests.filter((request) => request.authorization !== undefined);
		assert.ok(authed.length >= TOOL_CALLS.length);
		for (const request of authed) {
			assert.equal(request.authorization, `Bearer ${token}`);
			const allowed = PAT_ROUTES.some((route) => route.method === request.method && route.path.test(request.path));
			assert.ok(allowed, `${request.method} ${request.path} is not a PAT route`);
		}
		assert.equal(server.requests.some((request) => request.path.includes('/auth/bridge/session')), false);
		assert.equal(server.stderr().includes(token), false);
	} finally {
		await server.close();
	}
});

test('without a token every tool answers the instruction and the bridge sees no authenticated request', async () => {
	const server = await spawnServer({});
	try {
		for (const [name, args] of TOOL_CALLS) {
			const result = await server.mcp.callTool({ name, arguments: args });
			assert.equal(result.isError, true, name);
			assert.match(JSON.stringify(result.content), /Set OSIONOS_MCP_TOKEN/, name);
		}
		assert.deepEqual(server.requests.filter((request) => request.authorization !== undefined), []);
		assert.equal(server.requests.some((request) => request.path.includes('/auth/bridge/session')), false);
	} finally {
		await server.close();
	}
});

test('status and the connection resource name the auth mode and never echo a secret or an identity', async () => {
	const token = fakePat();
	const server = await spawnServer({ OSIONOS_MCP_TOKEN: token, OSIONOS_MCP_EMAIL: 'admin@x.test' });
	try {
		const status = await server.mcp.callTool({ name: 'osionos_status', arguments: {} });
		const resource = await server.mcp.readResource({ uri: 'osionos://connection' });
		const text = JSON.stringify([status, resource]);
		assert.match(text, /personal-access-token/);
		assert.match(text, /hasToken/);
		assert.equal(text.includes(token), false);
		for (let at = 0; at + 8 <= token.length; at += 1) assert.equal(text.includes(token.slice(at, at + 8)), false);
		assert.equal(/@/.test(text), false, 'an email leaked');
	} finally {
		await server.close();
	}
});
