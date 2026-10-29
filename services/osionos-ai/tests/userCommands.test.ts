import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * A user's own slash commands (U2, C1100-C1110) with OSIONOS_AI_USER_COMMANDS
 * on and OSIONOS_AI_USER_CONTEXT off: the commands are served, the skills and
 * rules are not (C1102).
 */
const { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } = await (async () => {
	process.env.OSIONOS_AI_USER_COMMANDS = 'on';
	delete process.env.OSIONOS_AI_USER_CONTEXT;
	return import('./harness.ts');
})();
const { app, mock, bridge, call, tokenFor, createConversation, postRun } = await startHarness();
const { SYSTEM_PROMPT } = await import('../src/runs/prompt.ts');
const { RESERVED_COMMAND_NAMES } = await import('../src/commands/userCommands.ts');
const { MAX_USER_COMMANDS } = await import('../src/context/repo.ts');
const { builtinCommands } = await import('../src/commands/builtins.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const A = () => tokenFor(USER_A, WORKSPACE_A);
const B = () => tokenFor(USER_B, WORKSPACE_B);
const items = (id = '') => `/api/ai/context/items${id ? `/${id}` : ''}`;
const TEMPLATE = 'Write my standup from these notes: $ARGUMENTS';

function create(kind: string, slug: string, body = TEMPLATE, token = A()) {
	return call(items(), { method: 'POST', token, body: { kind, slug, name: 'Standup', description: 'My standup', body } });
}

async function seed(kind: string, slug: string, body = 'b'): Promise<string> {
	const result = await app.db.query<{ id: string }>(
		`insert into public.ai_context_items (kind, scope, owner_id, slug, name, description, body, created_by, updated_by)
		 values ($1, 'user', $2, $3, 'n', 'd', $4, $2, $2) returning id`,
		[kind, USER_A, slug, body],
	);
	return result.rows[0]?.id as string;
}

async function commandsOf(surface: string, token = A()): Promise<{ name: string }[]> {
	const answer = await call(`/api/ai/commands?surface=${surface}`, { token });
	assert.equal(answer.status, 200);
	return (answer.body as { commands: { name: string }[] }).commands;
}

describe('user commands (commands flag on, context flag off)', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.ai_context_items');
		const keys = await app.redis.keys('ai:rl:context*');
		if (keys.length > 0) await app.redis.del(...keys);
	});

	it('C1104: a command is served on chat only, in the contract shape, to its owner only', async () => {
		assert.equal((await create('command', 'standup')).status, 201);
		const chat = await commandsOf('chat');
		assert.deepEqual(chat.at(-1), { name: 'standup', description: 'My standup', template: TEMPLATE, surface: 'chat' });
		assert.equal(chat.filter((command) => command.name === 'standup').length, 1);
		assert.ok(!(await commandsOf('editor')).some((command) => command.name === 'standup'), 'not on the editor');
		assert.ok(!(await commandsOf('chat', B())).some((command) => command.name === 'standup'), 'not for another user');
	});

	it('C1105: a built-in or composer action name is 409 command_reserved; every front action is reserved', async () => {
		for (const name of ['summarize', 'help', 'mcp']) {
			const answer = await create('command', name);
			assert.equal(answer.status, 409, name);
			assert.equal((answer.body as { error: { code: string } }).error.code, 'command_reserved');
		}
		const front = readFileSync(new URL('../../../src/features/ai/model/chatCommands.ts', import.meta.url), 'utf8');
		const block = /CHAT_ACTIONS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(front)?.[1] ?? '';
		const actions = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1] as string);
		assert.ok(actions.length >= 12, `read ${actions.length} front actions`);
		for (const action of actions) assert.ok(RESERVED_COMMAND_NAMES.has(action), `front action "${action}" is not reserved`);
	});

	it('C1109: a template with two $ARGUMENTS is 422 on create and on update', async () => {
		const twice = 'Say $ARGUMENTS then $ARGUMENTS';
		assert.equal((await create('command', 'echo', twice)).status, 422);
		const made = (await create('command', 'echo')).body as { id: string };
		const put = await call(items(made.id), { method: 'PUT', token: A(), body: { name: 'n', description: 'd', body: twice } });
		assert.equal(put.status, 422);
		assert.equal((put.body as { error: { code: string } }).error.code, 'command_template');
	});

	it('C1102: skills and rules do not exist here — create 400, not listed, PUT/DELETE 404, not in a run', async () => {
		assert.equal((await create('rule', 'tone', 'Be short.')).status, 400);
		assert.equal((await create('skill', 'notes', 'b')).status, 400);
		const ruleId = await seed('rule', 'tone', 'OFF RULE');
		await seed('command', 'standup', TEMPLATE);
		const listed = ((await call(items(), { token: A() })).body as { items: { kind: string; inPrompt: boolean }[] }).items;
		assert.deepEqual(listed.map((item) => [item.kind, item.inPrompt]), [['command', false]]);
		const put = await call(items(ruleId), { method: 'PUT', token: A(), body: { name: 'n', description: 'd', body: 'x' } });
		assert.equal(put.status, 404);
		assert.equal((await call(items(ruleId), { method: 'DELETE', token: A() })).status, 404);
		assert.equal((await call(`/api/ai/workspaces/${WORKSPACE_A}/rules`, { token: A() })).status, 404);
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false });
		const conversationId = await createConversation();
		await collect(new SseStream(await postRun(conversationId, randomUUID(), 'hello')));
		const body = JSON.stringify(mock.lastBody());
		assert.ok(!body.includes('OFF RULE') && !body.includes('standup from these notes'), 'no item reaches the run');
		const system = (mock.lastBody() as { messages: { role: string; content: unknown }[] }).messages.find((m) => m.role === 'system');
		assert.equal(system?.content, SYSTEM_PROMPT);
	});

	it('C1108: the cap holds under two concurrent creates', async () => {
		for (let n = 1; n < MAX_USER_COMMANDS; n += 1) await seed('command', `c${n}`);
		const both = await Promise.all([create('command', 'last-a'), create('command', 'last-b')]);
		assert.deepEqual(both.map((answer) => answer.status).sort(), [201, 409]);
		const active = await app.db.query("select count(*)::int as n from public.ai_context_items where kind = 'command' and archived_at is null");
		assert.equal(active.rows[0]?.n, MAX_USER_COMMANDS);
	});

	it('a failed read of the user commands still serves the built-ins', async () => {
		await app.db.query('alter table public.ai_context_items rename to ai_context_items_away');
		try {
			const answer = await call('/api/ai/commands?surface=chat', { token: A() });
			assert.equal(answer.status, 200);
			assert.deepEqual(answer.body, { commands: builtinCommands('chat') });
		} finally {
			await app.db.query('alter table public.ai_context_items_away rename to ai_context_items');
		}
	});

	it('C1107: before its migration, a command create is a clean 503', async () => {
		await app.db.query(
			"alter table public.ai_context_items drop constraint ai_context_items_kind_check, add constraint ai_context_items_kind_check check (kind in ('skill', 'rule'))",
		);
		try {
			const answer = await create('command', 'standup');
			assert.equal(answer.status, 503);
			assert.equal((answer.body as { error: { code: string } }).error.code, 'context_unavailable');
		} finally {
			await app.db.query(
				"alter table public.ai_context_items drop constraint ai_context_items_kind_check, add constraint ai_context_items_kind_check check (kind in ('skill', 'rule', 'command'))",
			);
		}
	});
});
