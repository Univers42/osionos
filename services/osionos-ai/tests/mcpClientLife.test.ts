import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { SECRET, startMcpRoutes, USER_A, USER_B, WORKSPACE_A } from './mcpRoutesHarness.ts';

/**
 * The life of a registered server (E1a): the sealed header, the snapshot, the
 * breaker, the erasure. Every title starts with the condition of the devil's
 * verdict it proves (e1-mcp-client-verdict.md).
 */
const { app, fake, as, register } = await startMcpRoutes();
// Dynamic: the service reads its configuration (the KEK) when it is imported.
const { openHeader } = await import('../src/mcpClient/secret.ts');
const { openSecret } = await import('../src/connections/crypto.ts');
const db = app.db as Pool;
const LIST = '/api/ai/mcp-servers';

describe('C264 the approvals table admits an mcp_call row and keeps the old kinds', () => {
	it('C264 an mcp_call approval inserts, and so does a create_page one', async () => {
		const conversationId = randomUUID();
		const runId = randomUUID();
		await db.query(
			"insert into public.ai_conversations (id, owner_id, workspace_id, title) values ($1, $2, $3, 'c')",
			[conversationId, USER_A, WORKSPACE_A],
		);
		await db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model, reserved_microusd, created_at)
			 values ($1, $2, $3, 'running', 'm', 0, now())`,
			[runId, conversationId, USER_A],
		);
		for (const tool of ['mcp_call', 'create_page']) {
			await db.query(
				`insert into public.ai_approvals
				   (id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
				 values ($1, $2, $3, $4, $5, $6, '{}'::jsonb, 'sha', 'pending', now() + interval '10 minutes')`,
				[randomUUID(), runId, conversationId, USER_A, WORKSPACE_A, tool],
			);
		}
		const kinds = await db.query('select tool from public.ai_approvals where run_id = $1 order by tool', [runId]);
		assert.deepEqual(kinds.rows.map((row) => row.tool), ['create_page', 'mcp_call']);
	});
});

describe('C274 the header is sealed to its server and its owner', () => {
	it('C274 the box opens with its own row and not on another id or another owner', async () => {
		const id = await register(USER_A, await fake(), { headerValue: SECRET });
		const row = (await db.query('select id, owner_id, header_ciphertext, header_wrapped_dek, header_kek_id from public.ai_mcp_servers where id = $1', [id])).rows[0];
		assert.ok(!Buffer.from(row.header_ciphertext).includes(Buffer.from(SECRET)), 'stored sealed, not in clear');
		assert.equal(openHeader(row), SECRET);
		assert.throws(() => openHeader({ ...row, owner_id: USER_B }));
		assert.throws(() => openHeader({ ...row, id: randomUUID() }));
		// The AAD of a connection is `id:owner`: a box moved from there must not open here.
		const box = { secret_box: row.header_ciphertext, wrapped_dek: row.header_wrapped_dek, kek_id: row.header_kek_id };
		assert.throws(() => openSecret(box, `${id}:${USER_A}`));
	});
});

describe('C285 erasing a user erases their servers and tools', () => {
	it('C285 ai_mcp_erase_user deletes the servers and the snapshots of that user only', async () => {
		const gone = randomUUID();
		const kept = randomUUID();
		const server = await fake({ tools: [{ name: 'a' }, { name: 'b' }] });
		const goneId = await register(gone, server);
		const keptId = await register(kept, server);
		for (const [user, id] of [[gone, goneId], [kept, keptId]] as const) await as(user, 'POST', `${LIST}/${id}/discover`);
		const count = async (table: string, id: string) =>
			Number((await db.query(`select count(*)::int as n from public.${table} where ${table === 'ai_mcp_tools' ? 'server_id' : 'id'} = $1`, [id])).rows[0].n);
		assert.equal(await count('ai_mcp_tools', goneId), 2);

		await db.query('select public.ai_mcp_erase_user($1::uuid)', [gone]);
		assert.equal(await count('ai_mcp_servers', goneId), 0);
		assert.equal(await count('ai_mcp_tools', goneId), 0, 'the snapshot went with the server');
		assert.equal(await count('ai_mcp_servers', keptId), 1);
		assert.equal(await count('ai_mcp_tools', keptId), 2);
	});
});

describe('C290 three failures break a server for five minutes', () => {
	it('C290 the third failure breaks it, a broken server is not called, an expired break retries', async () => {
		const server = await fake({ tools: [], echoAuthorization: true });
		const user = randomUUID();
		const id = await register(user, server, { headerValue: SECRET });
		for (let index = 0; index < 3; index++) {
			const failed = await as(user, 'POST', `${LIST}/${id}/discover`);
			assert.equal(failed.status, 502);
			assert.equal(failed.body?.code, 'mcp_protocol');
		}
		const row = (await db.query("select status, consecutive_failures, broken_until > now() + interval '4 minutes' as long from public.ai_mcp_servers where id = $1", [id])).rows[0];
		assert.equal(row.status, 'broken');
		assert.equal(row.consecutive_failures, 3);
		assert.equal(row.long, true, 'broken for about five minutes');
		const listed = (await as(user, 'GET', LIST)).body?.servers as { brokenUntil: string | null }[];
		assert.ok(Date.parse(String(listed[0]?.brokenUntil)) > Date.now() + 4 * 60 * 1000, 'the list says until when');

		const calls = server.stats.posts;
		const refused = await as(user, 'POST', `${LIST}/${id}/discover`);
		assert.equal(refused.status, 409);
		assert.equal(refused.body?.code, 'mcp_broken');
		assert.equal(server.stats.posts, calls, 'no request left the service');

		await db.query("update public.ai_mcp_servers set broken_until = now() - interval '1 second' where id = $1", [id]);
		server.behavior.echoAuthorization = false;
		const retried = await as(user, 'POST', `${LIST}/${id}/discover`);
		assert.equal(retried.status, 200);
		assert.ok(server.stats.posts > calls, 'the retry reached the server');
		const healed = (await db.query('select status, consecutive_failures, broken_until from public.ai_mcp_servers where id = $1', [id])).rows[0];
		assert.equal(healed.status, 'ok');
		assert.equal(healed.consecutive_failures, 0);
		assert.equal(healed.broken_until, null);
		const relisted = (await as(user, 'GET', LIST)).body?.servers as { brokenUntil: string | null }[];
		assert.equal(relisted[0]?.brokenUntil, null);
	});
});

describe('C277 a changed tool is off until the user says otherwise', () => {
	it('C277 a changed description turns that tool off, an unchanged one stays on', async () => {
		const server = await fake({ tools: [{ name: 'a', description: 'one' }, { name: 'b', description: 'two' }] });
		const user = randomUUID();
		const id = await register(user, server);
		await as(user, 'POST', `${LIST}/${id}/discover`);
		for (const name of ['a', 'b']) await as(user, 'PATCH', `${LIST}/${id}/tools/${name}`, { enabled: true });

		server.behavior.tools = [{ name: 'a', description: 'one, now with a new instruction' }, { name: 'b', description: 'two' }];
		const again = await as(user, 'POST', `${LIST}/${id}/discover`);
		const flags = Object.fromEntries((again.body?.tools as { name: string; enabled: boolean }[]).map((tool) => [tool.name, tool.enabled]));
		assert.deepEqual(flags, { a: false, b: true });
	});
});

describe('C275 the words of a server never reach a row or an answer', () => {
	it('C275 a server that echoes the header leaves no trace of it in the answer or the rows', async () => {
		const server = await fake({ tools: [], echoAuthorization: true });
		const user = randomUUID();
		const id = await register(user, server, { headerValue: SECRET });
		const failed = await as(user, 'POST', `${LIST}/${id}/discover`);
		assert.equal(failed.status, 502);
		const everything = JSON.stringify([failed.body, (await db.query('select * from public.ai_mcp_servers where id = $1', [id])).rows]);
		assert.ok(!everything.includes(SECRET));
		assert.ok(!everything.includes('upstream exploded'));
	});
});
