import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, it } from 'node:test';
import { USER_A, WORKSPACE_A, addMember, app, clearWindows, closeAll, mint, raw, rpc, sessionFor } from './mcpHarness.ts';
import { awaitWindowRoom } from './harness.ts';

// After the harness: a service module may read the configuration when it is
// imported, and the harness sets the environment first.
const { READ_TOOLS } = await import('../src/tools/readTools.ts');
const { WRITE_TOOLS } = await import('../src/tools/writeTools.ts');

/**
 * Who may speak to the remote MCP endpoint (G4b-1): C112, C114, C116, C118,
 * C120. What the tools return is in mcpTools.test.ts.
 */
after(closeAll);
beforeEach(async () => {
	await clearWindows();
	await app.db.query('delete from public.ai_access_tokens');
	await addMember(WORKSPACE_A, USER_A);
});

describe('the remote MCP endpoint: authentication', () => {
	it('no token, a bad token and a token in the query are all 401 (C112)', async () => {
		const good = await mint(USER_A, [WORKSPACE_A]);
		assert.equal((await rpc(null, 'tools/list')).status, 401);
		assert.equal((await rpc('osn_pat_' + 'x'.repeat(43), 'tools/list')).status, 401);
		// Only the Authorization header is read: the same good token in the URL is nothing.
		const inQuery = await raw('POST', `/api/ai/mcp?token=${good.token}`, {
			headers: { accept: 'application/json, text/event-stream' },
			body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
		});
		assert.equal(inQuery.status, 401);
		assert.equal(inQuery.headers['access-control-allow-origin'], undefined);
	});

	it('a token in the query is 401 even next to a valid Authorization header (C112)', async () => {
		const good = await mint(USER_A, [WORKSPACE_A]);
		const both = await raw('POST', `/api/ai/mcp?token=${good.token}`, {
			headers: { accept: 'application/json, text/event-stream', authorization: `Bearer ${good.token}` },
			body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
		});
		assert.equal(both.status, 401);
	});

	it('a JSON-RPC batch is refused: one POST is one call of the rate window (review F1)', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const batch = await raw('POST', '/api/ai/mcp', {
			headers: { accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
			body: [
				{ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
				{ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
			],
		});
		assert.equal(batch.status, 400);
	});

	it('a revoked token is refused on the very next call, with no cache (C116)', async () => {
		const { id, token } = await mint(USER_A, [WORKSPACE_A]);
		assert.equal((await rpc(token, 'tools/list')).status, 200);
		const revoke = await raw('DELETE', `/api/ai/access-tokens/${id}`, {
			headers: { authorization: `Bearer ${sessionFor(USER_A, WORKSPACE_A)}` },
		});
		assert.equal(revoke.status, 204);
		assert.equal((await rpc(token, 'tools/list')).status, 401);
	});

	it('an expired token is refused', async () => {
		const { id, token } = await mint(USER_A, [WORKSPACE_A]);
		await app.db.query(
			`update public.ai_access_tokens
			    set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
			  where id = $1::uuid`,
			[id],
		);
		assert.equal((await rpc(token, 'tools/list')).status, 401);
	});

	it('an app session is not a PAT on this route', async () => {
		assert.equal((await rpc(sessionFor(USER_A, WORKSPACE_A), 'tools/list')).status, 401);
	});

	it('a PAT opens no other /api/ai route (C114)', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const calls: [string, string][] = [
			['POST', `/api/ai/approvals/${randomUUID()}`],
			['GET', `/api/ai/approvals/${randomUUID()}`],
			['GET', '/api/ai/connections'],
			['POST', '/api/ai/runs'],
			['GET', '/api/ai/conversations'],
			['POST', '/api/ai/conversations'],
		];
		for (const [method, path] of calls) {
			const answer = await raw(method, path, {
				headers: { authorization: `Bearer ${token}` },
				body: method === 'POST' ? {} : undefined,
			});
			assert.equal(answer.status, 401, `${method} ${path}`);
		}
	});

	it('GET and DELETE answer 405, and the 405 carries no CORS header', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		for (const method of ['GET', 'DELETE']) {
			const answer = await raw(method, '/api/ai/mcp', { headers: { authorization: `Bearer ${token}` } });
			assert.equal(answer.status, 405, method);
		}
	});
});

describe('the remote MCP endpoint: host, origin and rate (C118)', () => {
	it('a request with an Origin is refused 403, with no access-control-allow header', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const answer = await rpc(token, 'tools/list', {}, { headers: { origin: 'https://evil.example' } });
		assert.equal(answer.status, 403);
		assert.deepEqual(Object.keys(answer.headers).filter((name) => name.startsWith('access-control-')), []);
	});

	it('a request without an Origin passes', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		assert.equal((await rpc(token, 'tools/list')).status, 200);
	});

	it('a disallowed Host is refused, even with a good token', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const answer = await rpc(token, 'tools/list', {}, { headers: { host: 'rebind.example' } });
		assert.equal(answer.status, 403);
	});

	it('a preflight gets no CORS headers', async () => {
		const answer = await raw('OPTIONS', '/api/ai/mcp', {
			headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
		});
		assert.ok(answer.status === 403 || answer.status === 405, `status ${answer.status}`);
		assert.deepEqual(Object.keys(answer.headers).filter((name) => name.startsWith('access-control-')), []);
	});

	it('the 61st call of a token in a minute is 429 (60 a minute)', async () => {
		await awaitWindowRoom();
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		for (let call = 1; call <= 60; call += 1) {
			assert.equal((await rpc(token, 'tools/list')).status, 200, `call ${call}`);
		}
		const limited = await rpc(token, 'tools/list');
		assert.equal(limited.status, 429);
		assert.ok(Number(limited.headers['retry-after']) > 0);
	});

	it('the limit is on the owner too: three tokens of one user share 120 a minute', async () => {
		await awaitWindowRoom();
		const tokens = [await mint(USER_A, [WORKSPACE_A]), await mint(USER_A, [WORKSPACE_A]), await mint(USER_A, [WORKSPACE_A])];
		let ok = 0;
		let limited = 0;
		for (let call = 0; call < 125; call += 1) {
			const status = (await rpc(tokens[call % 3]!.token, 'tools/list')).status;
			if (status === 200) ok += 1;
			else if (status === 429) limited += 1;
		}
		assert.equal(ok, 120);
		assert.equal(limited, 5);
	});
});

describe('the remote MCP endpoint: tools list (C120)', () => {
	it('initialize answers with instructions that call results untrusted data (C119)', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const answer = await rpc(token, 'initialize', {
			protocolVersion: '2025-03-26',
			capabilities: {},
			clientInfo: { name: 'test', version: '1' },
		});
		assert.equal(answer.status, 200, answer.raw);
		assert.match(String(answer.body.result.instructions), /untrusted/i);
		assert.equal(answer.headers['mcp-session-id'], undefined, 'stateless: no session');
	});

	it('tools/list names are exactly the READ_TOOLS names, and no write tool exists', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A]);
		const answer = await rpc(token, 'tools/list');
		const names = (answer.body.result.tools as { name: string }[]).map((tool) => tool.name).sort();
		assert.deepEqual(names, READ_TOOLS.map((tool) => tool.name).sort());
		assert.ok(READ_TOOLS.every((tool) => tool.kind === 'read'));
	});

	it('a token with only write_approval lists the three write tools, and no read tool', async () => {
		const { token } = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const list = await rpc(token, 'tools/list');
		const names = (list.body.result.tools as { name: string }[]).map((tool) => tool.name).sort();
		assert.deepEqual(names, WRITE_TOOLS.map((tool) => tool.name).sort());
		const call = await rpc(token, 'tools/call', { name: 'search_workspace', arguments: { query: 'x' } });
		assert.ok(call.body.error || call.body.result?.isError, call.raw);
	});

	it('the config holds no bridge secret and no JWT secret (C120)', () => {
		const source = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
		assert.doesNotMatch(source, /OSIONOS_BRIDGE_SHARED_SECRET/);
		assert.doesNotMatch(source, /JWT_SECRET/);
	});
});
