import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import fc from 'fast-check';
import type { Pool } from 'pg';
import type { ToolSet } from 'ai';
import { SseStream, collect } from './sse.ts';

/**
 * A user's own hooks (U3, C1120-C1133) with OSIONOS_AI_USER_HOOKS on and the
 * other context flags off: a hook only ever takes tools away from a run and
 * refuses the approve of a card it names.
 */
const { startHarness, USER_A, USER_B, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_USER_HOOKS = 'on';
	delete process.env.OSIONOS_AI_USER_CONTEXT;
	delete process.env.OSIONOS_AI_USER_COMMANDS;
	return import('./harness.ts');
})();
const { app, mock, bridge, call, tokenFor, createConversation, postRun } = await startHarness();
const { SYSTEM_PROMPT } = await import('../src/runs/prompt.ts');
const { MAX_USER_HOOKS, approvalToolNames, dropBlockedTools, isBlocked } = await import('../src/context/hooks.ts');
const { mcpToolName } = await import('../src/mcpClient/runTools.ts');
const { buildRunTools } = await import('../src/runs/toolSet.ts');
const { createToolPool } = await import('../src/tools/index.ts');
const { BUILTIN_AGENTS } = await import('../src/agents/builtins.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const A = () => tokenFor(USER_A, WORKSPACE_A);
const items = (id = '') => `/api/ai/context/items${id ? `/${id}` : ''}`;
const errorOf = (body: unknown) => (body as { error: { code: string } }).error.code;

function create(slug: string, body: string, token = A()) {
	return call(items(), { method: 'POST', token, body: { kind: 'hook', slug, name: 'No writes', description: 'd', body } });
}

async function seedHook(slug: string, body: string, owner = USER_A): Promise<void> {
	await app.db.query(
		`insert into public.ai_context_items (kind, scope, owner_id, slug, name, description, body, created_by, updated_by)
		 values ('hook', 'user', $1, $2, 'n', 'd', $3, $1, $1)`,
		[owner, slug, body],
	);
}

/** The tool names the last upstream request offered. */
function offeredTools(): string[] {
	const tools = (mock.lastBody() as { tools?: { function?: { name: string }; name?: string }[] }).tools ?? [];
	return tools.map((tool) => tool.function?.name ?? tool.name ?? '').sort();
}

async function plainRun(text = 'hello'): Promise<void> {
	mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: null });
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), text)));
	assert.ok(events.some((event) => event.event === 'done'), 'the run completes');
}

/** A run in which the model asks for create_page: the id of the pending approval. */
async function askCreatePage(): Promise<string> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: 'create_page', arguments: { title: 'The report', workspaceId: WORKSPACE_A } },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const asked = events.filter((event) => event.event === 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	return String((asked[0]?.data as { approvalId: string }).approvalId);
}

function decide(approvalId: string, decision: 'approve' | 'decline') {
	return call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token: A(), body: { decision } });
}

async function statusOf(approvalId: string): Promise<string> {
	const row = await app.db.query<{ status: string }>('select status from public.ai_approvals where id = $1', [approvalId]);
	return row.rows[0]?.status ?? 'missing';
}

async function withTableAway(work: () => Promise<void>): Promise<void> {
	await app.db.query('alter table public.ai_context_items rename to ai_context_items_away');
	try {
		await work();
	} finally {
		await app.db.query('alter table public.ai_context_items_away rename to ai_context_items');
	}
}

function textOf(content: unknown): string {
	if (typeof content === 'string') return content;
	return Array.isArray(content) ? content.map((part) => (part as { text?: string }).text ?? '').join('') : '';
}

const fakeTool = (name: string) => ({ description: name }) as unknown as ToolSet[string];

describe('user hooks (hooks flag on)', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.ai_context_items');
		await app.db.query('delete from public.ai_approvals');
		const keys = await app.redis.keys('ai:rl:context*');
		if (keys.length > 0) await app.redis.del(...keys);
		bridge.reset();
	});

	it('C1120: dropBlockedTools keeps a subset, the same objects, and nothing a pattern names', () => {
		const name = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/);
		const pattern = fc.tuple(name, fc.boolean()).map(([text, star]) => (star ? `${text}*` : text));
		fc.assert(
			fc.property(fc.uniqueArray(name, { maxLength: 12 }), fc.array(pattern, { maxLength: 6 }), (names, patterns) => {
				const tools: ToolSet = Object.fromEntries(names.map((toolName) => [toolName, fakeTool(toolName)]));
				const kept = dropBlockedTools(tools, patterns);
				for (const [key, tool] of Object.entries(kept)) {
					assert.equal(tool, tools[key], 'never a replaced tool');
					assert.ok(!isBlocked([key], patterns), `kept a blocked ${key}`);
				}
				for (const key of names) if (!isBlocked([key], patterns)) assert.ok(key in kept, `dropped an unblocked ${key}`);
				assert.ok(Object.keys(kept).every((key) => key in tools), 'never a new key');
			}),
		);
	});

	it('C1127: blocking create_page or add_blocks blocks build_plan; a star is a prefix, never a regex', () => {
		assert.ok(isBlocked(['build_plan'], ['create_page']));
		assert.ok(isBlocked(['build_plan'], ['add_*']));
		assert.ok(!isBlocked(['build_plan'], ['rename_page']));
		assert.ok(!isBlocked(['create_pages'], ['create_page']), 'an exact name is exact');
		assert.ok(!isBlocked(['xmcp_a'], ['mcp_*']), 'a prefix anchors at the start');
	});

	it('C1124: a hook is 1 to 32 pattern lines; anything else is 422 hook_pattern on create and on update', async () => {
		const ok = await create('no-writes', 'create_page\nweb-fetch\nmcp_ab12cd34_*');
		assert.equal(ok.status, 201);
		for (const body of ['create_page\n', 'a\n\nb', 'create page', '*', '9tool', 'mcp_*x', Array.from({ length: 33 }, (_, n) => `t${n}`).join('\n'), 'a'.repeat(65)]) {
			const answer = await create('bad', body);
			assert.equal(answer.status, 422, JSON.stringify(body));
			assert.equal(errorOf(answer.body), 'hook_pattern');
		}
		assert.equal((await create('max', Array.from({ length: 32 }, (_, n) => `t${n}`).join('\n'))).status, 201);
		const id = (ok.body as { id: string }).id;
		const put = await call(items(id), { method: 'PUT', token: A(), body: { name: 'n', description: 'd', body: 'bad line' } });
		assert.equal(put.status, 422);
		assert.equal(errorOf(put.body), 'hook_pattern');
	});

	it('C1131: eleven concurrent creates leave at most ten hooks', async () => {
		const answers = await Promise.all(Array.from({ length: MAX_USER_HOOKS + 1 }, (_, n) => create(`h${n}`, `tool_${n}`)));
		assert.equal(answers.filter((answer) => answer.status === 201).length, MAX_USER_HOOKS);
		assert.equal(answers.filter((answer) => answer.status === 409).length, 1);
		const active = await app.db.query("select count(*)::int as n from public.ai_context_items where kind = 'hook' and archived_at is null");
		assert.equal(active.rows[0]?.n, MAX_USER_HOOKS);
	});

	it('C1121/C1129: no hook or a hook naming nothing offered: the same tools; a hook never reaches the prompt', async () => {
		await plainRun();
		const before = offeredTools();
		assert.ok(before.includes('create_page') && before.includes('read_page'), `the run offers writes and reads: ${before}`);
		await seedHook('nothing', 'HOOKMARK_none');
		await plainRun();
		assert.deepEqual(offeredTools(), before);
		assert.ok(!JSON.stringify(mock.lastBody()).includes('HOOKMARK'), 'the hook body is not in the request');
		const system = (mock.lastBody() as { messages: { role: string; content: unknown }[] }).messages.find((m) => m.role === 'system');
		assert.equal(textOf(system?.content), SYSTEM_PROMPT);
		const listed = ((await call(items(), { token: A() })).body as { items: { kind: string; inPrompt: boolean }[] }).items;
		assert.deepEqual(listed.map((item) => [item.kind, item.inPrompt]), [['hook', false]]);
	});

	it('C1120: a hook takes its tools out of the run, for its owner only', async () => {
		await plainRun();
		const before = offeredTools();
		await seedHook('no-pages', 'create_page\narchive_*');
		await plainRun();
		const offered = offeredTools();
		assert.ok(!offered.includes('create_page') && !offered.includes('archive_page'), `still offered: ${offered}`);
		assert.deepEqual(offered, before.filter((name) => name !== 'create_page' && name !== 'archive_page'));
		await seedHook('mine', 'read_page', USER_B);
		await plainRun();
		assert.ok(offeredTools().includes('read_page'), "another user's hook changes nothing");
	});

	it('C1132: blocking load_skill, remember and open_page still completes, with the same system prompt', async () => {
		await seedHook('always-on', 'load_skill\nremember\nopen_page');
		await plainRun();
		const offered = offeredTools();
		for (const name of ['load_skill', 'remember', 'open_page']) assert.ok(!offered.includes(name), `${name} still offered`);
		const system = (mock.lastBody() as { messages: { role: string; content: unknown }[] }).messages.find((m) => m.role === 'system');
		assert.equal(textOf(system?.content), SYSTEM_PROMPT);
	});

	it('C1122: an unreadable hook table fails closed — no tools — and the run still answers', async () => {
		await withTableAway(async () => {
			await plainRun();
			assert.deepEqual(offeredTools(), []);
		});
	});

	it('C1122: an unreadable hook read leaves research and agent runs with no tools either', async () => {
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
		const base = { db: app.db as Pool, user, runId: randomUUID(), conversationId: randomUUID(), ownerId: USER_A, pages: [], sources: [], workspaceId: WORKSPACE_A, emit: async () => {} };
		const agent = BUILTIN_AGENTS[0];
		for (const extra of [{ research: true }, { agent }]) {
			const open = buildRunTools({ ...base, ...extra, pool: createToolPool() } as never);
			assert.ok(open.tools && Object.keys(open.tools).length > 0, 'the run has tools without hooks');
			const closed = buildRunTools({ ...base, ...extra, pool: createToolPool(), hooks: { kind: 'unavailable' } } as never);
			assert.equal(closed.tools, undefined);
		}
	});

	it('C1125: a hook written after the card refuses the approve before the claim; the row stays pending, nothing is written', async () => {
		const approvalId = await askCreatePage();
		await seedHook('no-create', 'create_page');
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 403);
		assert.equal(errorOf(answer.body), 'blocked_by_hook');
		assert.equal(await statusOf(approvalId), 'pending');
		assert.equal(bridge.count, 0, 'no bridge call');
	});

	it('C1125: rename_page, archive_page, add_blocks, build_plan (alias) and mcp_call are refused the same way', async () => {
		const approvalId = await askCreatePage();
		const cases: [string, string][] = [
			['rename_page', 'rename_page'],
			['archive_page', 'archive_*'],
			['add_blocks', 'add_blocks'],
			['build_plan', 'create_page'],
			['mcp_call', 'mcp_call'],
		];
		for (const [tool, pattern] of cases) {
			await app.db.query("delete from public.ai_context_items where kind = 'hook'");
			await app.db.query('update public.ai_approvals set tool = $2 where id = $1', [approvalId, tool]);
			await seedHook('block', pattern);
			const answer = await decide(approvalId, 'approve');
			assert.equal(answer.status, 403, tool);
			assert.equal(errorOf(answer.body), 'blocked_by_hook', tool);
			assert.equal(await statusOf(approvalId), 'pending', tool);
		}
		assert.equal(bridge.count, 0);
	});

	it('C1123: an MCP card matches by its stored model name or the name derived from server and tool', async () => {
		const serverId = randomUUID();
		const prefix = `mcp_${serverId.replaceAll('-', '').slice(0, 8)}_`;
		const derived = (toolName: string) => mcpToolName(serverId, toolName, new Set());
		const row = (args: Record<string, unknown>) => ({ tool: 'mcp_call', args: { serverId, snapshotSha256: 'x', arguments: {}, ...args } });
		assert.ok(isBlocked(approvalToolNames(row({ toolName: 'search' })), [`${prefix}*`]), 'a server prefix, pre-U3 row');
		assert.ok(isBlocked(approvalToolNames(row({ toolName: 'search', modelName: `${prefix}search_2` })), [`${prefix}search_2`]), 'a collision suffix');
		assert.ok(isBlocked(approvalToolNames(row({ toolName: 'GetData' })), [derived('GetData')]), 'an uppercase name');
		assert.ok(isBlocked(approvalToolNames(row({ toolName: 'get-data' })), [`${prefix}get-data`]), 'a name with -');
		assert.ok(isBlocked(approvalToolNames(row({ toolName: 'a.b' })), [`${prefix}a_b`]), 'a name the model API rewrote');
		assert.ok(!isBlocked(approvalToolNames(row({ toolName: 'search' })), [`${prefix}other`]));

		const approvalId = await askCreatePage();
		await app.db.query('update public.ai_approvals set tool = $2, args = $3::jsonb where id = $1', [
			approvalId,
			'mcp_call',
			JSON.stringify(row({ toolName: 'get-data', serverLabel: 'S', serverHost: 'h', description: 'd' }).args),
		]);
		await seedHook('no-server', `${prefix}*`);
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 403);
		assert.equal(await statusOf(approvalId), 'pending');
	});

	it('C1126: a hook read that fails at approve is a 503 with the row pending; a decline never reads hooks', async () => {
		const approvalId = await askCreatePage();
		await withTableAway(async () => {
			const answer = await decide(approvalId, 'approve');
			assert.equal(answer.status, 503);
			assert.equal(errorOf(answer.body), 'hooks_unavailable');
			assert.equal(await statusOf(approvalId), 'pending');
			assert.equal((await decide(approvalId, 'decline')).status, 200);
		});
		assert.equal(await statusOf(approvalId), 'declined');
		assert.equal(bridge.count, 0);
	});

	it('C1127: the resume of a partial build_plan is refused by a create_page hook, and fails closed', async () => {
		const approvalId = await askCreatePage();
		await app.db.query("update public.ai_approvals set tool = 'build_plan', status = 'partial' where id = $1", [approvalId]);
		const resume = () => call(`/api/ai/approvals/${approvalId}/resume`, { method: 'POST', token: A(), body: {} });
		await seedHook('no-create', 'create_page');
		const blocked = await resume();
		assert.equal(blocked.status, 403);
		assert.equal(errorOf(blocked.body), 'blocked_by_hook');
		await withTableAway(async () => {
			const unreadable = await resume();
			assert.equal(unreadable.status, 503);
			assert.equal(errorOf(unreadable.body), 'hooks_unavailable');
		});
		assert.equal(await statusOf(approvalId), 'partial');
		assert.equal(bridge.count, 0);
	});

	it('an mcp_call hook takes the MCP tools out of the run too', () => {
		const tools: ToolSet = { mcp_ab12cd34_search: fakeTool('a'), read_page: fakeTool('b'), mcp_call_like: fakeTool('c') };
		assert.deepEqual(Object.keys(dropBlockedTools(tools, ['mcp_call'])).sort(), ['mcp_call_like', 'read_page']);
	});

	it('a hook that names another tool lets the approve through', async () => {
		const approvalId = await askCreatePage();
		await seedHook('other', 'archive_page');
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 200);
		assert.ok(bridge.count > 0, 'the write went out');
	});

	it('C1133: the erasure of a user deletes their hooks', async () => {
		await seedHook('gone', 'create_page');
		await seedHook('kept', 'create_page', USER_B);
		await app.db.query('select public.ai_context_erase_user($1)', [USER_A]);
		const left = await app.db.query<{ owner_id: string }>("select owner_id from public.ai_context_items where kind = 'hook'");
		assert.deepEqual(left.rows.map((r) => r.owner_id), [USER_B]);
	});
});

