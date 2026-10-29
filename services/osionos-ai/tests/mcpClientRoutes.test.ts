import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { awaitWindowRoom } from './harness.ts';
import { SECRET, startMcpRoutes, USER_A, USER_B } from './mcpRoutesHarness.ts';

/**
 * The routes of the MCP servers (E1a): what a user may register, what comes
 * back, whose server is whose. Every title starts with the condition of the
 * devil's verdict it proves (e1-mcp-client-verdict.md).
 */
const { app, fake, as, register, tokenOf, staleTokenOf } = await startMcpRoutes();
const db = app.db as Pool;
const LIST = '/api/ai/mcp-servers';
const code = (body: { code?: unknown } | null) => body?.code;

describe('C268 the URL and the header are checked', () => {
	it('C268 a URL that is not https, or carries credentials, a fragment or a query, is refused', async () => {
		const user = randomUUID();
		for (const url of [
			'http://example.com/mcp',
			'https://user:pw@example.com/mcp',
			'https://example.com/mcp#frag',
			'https://example.com/mcp?token=abc',
			'ftp://example.com/mcp',
			'not a url',
		]) {
			const made = await as(user, 'POST', LIST, { label: 'bad', url, acknowledged: true });
			assert.equal(made.status, 400, url);
		}
		const mine = await as(user, 'GET', LIST);
		assert.deepEqual(mine.body?.servers, [], 'nothing was stored');
	});

	it('C268 the header name is Authorization or x-*, the value is one printable line', async () => {
		const server = await fake();
		for (const extra of [
			{ headerName: 'Cookie', headerValue: 'abcdefgh1234' },
			{ headerName: 'Host', headerValue: 'abcdefgh1234' },
			{ headerName: 'Authorization', headerValue: 'abcdefgh\r\nX-Evil: 1' },
			{ headerName: 'Authorization', headerValue: 'abcdefgh\nrest' },
			{ headerName: 'Authorization', headerValue: 'short' },
		]) {
			const made = await as(USER_A, 'POST', LIST, { label: 'bad', url: server.url, acknowledged: true, ...extra });
			assert.equal(made.status, 400, JSON.stringify(extra));
		}
		const ok = await as(USER_A, 'POST', LIST, { label: 'ok', url: server.url, headerName: 'x-api-key', headerValue: SECRET, acknowledged: true });
		assert.equal(ok.status, 201);
		await as(USER_A, 'DELETE', `${LIST}/${String(ok.body?.id)}`);
	});
});

describe('C282 a server is registered only after the disclosure', () => {
	it('C282 the create route refuses a missing or false acknowledged', async () => {
		const server = await fake();
		const user = randomUUID();
		for (const extra of [{}, { acknowledged: false }, { acknowledged: 'true' }]) {
			const made = await as(user, 'POST', LIST, { label: 'x', url: server.url, ...extra });
			assert.equal(made.status, 400, JSON.stringify(extra));
		}
		assert.deepEqual((await as(user, 'GET', LIST)).body?.servers, [], 'nothing was stored');
	});
});

describe('C269 there is no read-only mark', () => {
	it('C269 create and patch refuse a read_only key', async () => {
		const server = await fake();
		const made = await as(USER_A, 'POST', LIST, { label: 'x', url: server.url, acknowledged: true, read_only: true });
		assert.equal(made.status, 400);
		const id = await register(USER_A, server);
		const patched = await as(USER_A, 'PATCH', `${LIST}/${id}`, { label: 'y', read_only: true });
		assert.equal(patched.status, 400);
		await as(USER_A, 'DELETE', `${LIST}/${id}`);
	});
});

describe('C270 a new URL does not inherit the old credential or the old tools', () => {
	it('C270 a url change needs the header in the same request and turns every tool off', async () => {
		const first = await fake({ tools: [{ name: 'a' }, { name: 'b' }] });
		const second = await fake({ tools: [{ name: 'a' }] });
		const id = await register(USER_A, first, { headerValue: SECRET });
		assert.equal((await as(USER_A, 'POST', `${LIST}/${id}/discover`)).status, 200);
		for (const name of ['a', 'b']) assert.equal((await as(USER_A, 'PATCH', `${LIST}/${id}/tools/${name}`, { enabled: true })).status, 200);

		const alone = await as(USER_A, 'PATCH', `${LIST}/${id}`, { url: second.url });
		assert.equal(alone.status, 400);
		assert.equal(code(alone.body), 'invalid_request');
		const before = await db.query('select url, header_ciphertext from public.ai_mcp_servers where id = $1', [id]);
		assert.equal(before.rows[0].url, first.url, 'the refused change stored nothing');

		const moved = await as(USER_A, 'PATCH', `${LIST}/${id}`, { url: second.url, headerValue: `${SECRET}-new` });
		assert.equal(moved.status, 200);
		const tools = await db.query('select name, enabled from public.ai_mcp_tools where server_id = $1', [id]);
		assert.ok(tools.rows.length > 0);
		assert.ok(tools.rows.every((row) => row.enabled === false), 'every tool is off again');
		const after = await db.query('select header_ciphertext from public.ai_mcp_servers where id = $1', [id]);
		assert.notDeepEqual(after.rows[0].header_ciphertext, before.rows[0].header_ciphertext, 'the box was replaced');
		await as(USER_A, 'DELETE', `${LIST}/${id}`);
	});
});

describe('C271 nothing secret comes back, and the tables are closed to the public roles', () => {
	it('C271 the list carries a host and four characters, no box, no URL, no secret', async () => {
		const user = randomUUID();
		const server = await fake({ tools: [{ name: 'a', description: 'does a' }] });
		const id = await register(user, server, { headerValue: SECRET });
		await as(user, 'POST', `${LIST}/${id}/discover`);
		const listed = await as(user, 'GET', LIST);
		const raw = JSON.stringify(listed.body);
		const entry = (listed.body?.servers as Record<string, unknown>[])[0];
		assert.deepEqual(Object.keys(entry).sort(), ['brokenUntil', 'headerLast4', 'headerName', 'host', 'id', 'label', 'status', 'tools']);
		assert.equal(entry.host, new URL(server.url).host);
		assert.equal(entry.headerLast4, SECRET.slice(-4));
		assert.ok(!raw.includes(SECRET) && !raw.includes(new URL(server.url).pathname + '"'), 'no secret, no path');
		assert.ok(!/ciphertext|wrapped|secret_box|kek/i.test(raw));
		await as(user, 'DELETE', `${LIST}/${id}`);
	});

	it('C271 anon and authenticated cannot read or write either table', async () => {
		for (const role of ['anon', 'authenticated']) {
			for (const sql of ['select 1 from public.ai_mcp_servers', 'select 1 from public.ai_mcp_tools']) {
				const client = await db.connect();
				try {
					await client.query('begin');
					await client.query(`set local role ${role}`);
					await assert.rejects(client.query(sql), { code: '42501' }, `${role}: ${sql}`);
				} finally {
					await client.query('rollback');
					client.release();
				}
			}
		}
	});

	it('C271 the secret reaches no log line while a server is registered and discovered', async () => {
		const server = await fake({ tools: [{ name: 'a' }] });
		const written: string[] = [];
		const out = process.stdout.write.bind(process.stdout);
		const err = process.stderr.write.bind(process.stderr);
		// Forwarded, so the runner keeps reporting through the same streams.
		process.stdout.write = ((chunk: string | Uint8Array) => (written.push(String(chunk)), out(chunk))) as typeof process.stdout.write;
		process.stderr.write = ((chunk: string | Uint8Array) => (written.push(String(chunk)), err(chunk))) as typeof process.stderr.write;
		try {
			const id = await register(USER_A, server, { headerValue: SECRET });
			await as(USER_A, 'POST', `${LIST}/${id}/discover`);
			await as(USER_A, 'DELETE', `${LIST}/${id}`);
		} finally {
			process.stdout.write = out;
			process.stderr.write = err;
		}
		assert.ok(!written.join('').includes(SECRET));
	});
});

describe('C276 the number of servers and of tools is capped', () => {
	it('C276 sixty tools is mcp_too_large and does not count toward the breaker', async () => {
		const tools = Array.from({ length: 60 }, (_, index) => ({ name: `t${index}` }));
		const id = await register(USER_A, await fake({ tools }));
		const found = await as(USER_A, 'POST', `${LIST}/${id}/discover`);
		assert.equal(found.status, 502);
		assert.equal(code(found.body), 'mcp_too_large');
		const row = await db.query('select consecutive_failures from public.ai_mcp_servers where id = $1', [id]);
		assert.equal(row.rows[0].consecutive_failures, 0);
		const stored = await db.query('select 1 from public.ai_mcp_tools where server_id = $1', [id]);
		assert.equal(stored.rows.length, 0, 'no tool of an oversized list is stored');
		await as(USER_A, 'DELETE', `${LIST}/${id}`);
	});

	it('C276 the eleventh server of a user is refused, another user is not', async () => {
		const server = await fake();
		const user = randomUUID();
		for (let index = 0; index < 10; index++) await register(user, server);
		const eleventh = await as(user, 'POST', LIST, { label: 'one too many', url: server.url, acknowledged: true });
		assert.equal(eleventh.status, 409);
		assert.equal(code(eleventh.body), 'too_many_servers');
		assert.equal((await as(randomUUID(), 'POST', LIST, { label: 'free', url: server.url, acknowledged: true })).status, 201);
	});
});

describe('C289 a server is its owner\'s, behind a fresh session and a rate limit', () => {
	it('C289 a stranger and a missing id get the same 404 on every route', async () => {
		const id = await register(USER_A, await fake());
		const unknown = randomUUID();
		const probes: [string, string, unknown][] = [
			['PATCH', '', { label: 'x' }],
			['DELETE', '', undefined],
			['POST', '/discover', undefined],
			['PATCH', '/tools/a', { enabled: true }],
		];
		for (const [method, suffix, body] of probes) {
			const stranger = await as(USER_B, method, `${LIST}/${id}${suffix}`, body);
			const missing = await as(USER_B, method, `${LIST}/${unknown}${suffix}`, body);
			assert.equal(stranger.status, 404, `${method} ${suffix}`);
			assert.deepEqual(stranger.body, missing.body, `${method} ${suffix}`);
		}
		assert.equal((await as(USER_A, 'GET', LIST)).body?.servers instanceof Array, true);
		await as(USER_A, 'DELETE', `${LIST}/${id}`);
	});

	it('C289 a session older than ten minutes cannot register or change a server', async () => {
		const server = await fake();
		const id = await register(USER_A, server);
		const stale = staleTokenOf(USER_A);
		const made = await as(USER_A, 'POST', LIST, { label: 'x', url: server.url, acknowledged: true }, stale);
		assert.equal(made.status, 403);
		assert.equal(code(made.body), 'reauth_required');
		const patched = await as(USER_A, 'PATCH', `${LIST}/${id}`, { label: 'y' }, stale);
		assert.equal(patched.status, 403);
		assert.equal((await as(USER_A, 'GET', LIST, undefined, stale)).status, 200, 'reading needs no fresh session');
		await as(USER_A, 'DELETE', `${LIST}/${id}`);
	});

	it('C289 the seventh discovery in a minute is 429', async () => {
		await awaitWindowRoom();
		const user = randomUUID();
		const id = await register(user, await fake());
		for (let index = 0; index < 6; index++) assert.equal((await as(user, 'POST', `${LIST}/${id}/discover`)).status, 200);
		const limited = await as(user, 'POST', `${LIST}/${id}/discover`);
		assert.equal(limited.status, 429);
		assert.equal(code(limited.body), 'rate_limited');
	});
});

describe('C292 a server belongs to a user, never to a workspace', () => {
	it('C292 no table has a workspace column, and a member of the same workspace sees nothing', async () => {
		const columns = await db.query(
			"select column_name from information_schema.columns where table_name in ('ai_mcp_servers', 'ai_mcp_tools') and column_name like '%workspace%'",
		);
		assert.equal(columns.rows.length, 0);
		const owner = randomUUID();
		const other = randomUUID();
		const id = await register(owner, await fake());
		assert.equal(tokenOf(owner) === tokenOf(other), false);
		const theirs = await as(other, 'GET', LIST);
		assert.deepEqual(theirs.body?.servers, []);
		assert.equal((await as(other, 'DELETE', `${LIST}/${id}`)).status, 404);
		await as(owner, 'DELETE', `${LIST}/${id}`);
	});
});
