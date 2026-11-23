import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type { ToolSet } from 'ai';

/** Plan mode (AM14): the write, builder and MCP tools are not in the request at all. */
const USER_ALLOWED = '11111111-1111-4111-8111-111111111111';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_ALLOWED;
process.env.OSIONOS_AI_BUILDERS = 'on';

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, postRun, tokenFor, createConversation } = await startHarness();
// After the harness: these modules read the config, which the harness environment feeds.
const { keepPlanTools } = await import('../src/modes/planTools.ts');
const { PLAN_PROMPT_BLOCK } = await import('../src/runs/planPrompt.ts');
const { writeTools } = await import('../src/tools/writeToolList.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const WRITES = ['create_page', 'rename_page', 'archive_page', 'add_blocks', 'build_plan'];
const body = () => mock.lastBody() as { tools?: { function: { name: string } }[]; messages: { role: string; content: string }[] };
const toolNames = (): string[] => (body().tools ?? []).map((tool) => tool.function.name);
const systemText = (): string => body().messages.find((message) => message.role === 'system')?.content ?? '';

async function run(mode: 'plan' | 'manual'): Promise<void> {
	const id = await createConversation(`plan-${mode}`);
	const patch = await call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token: tokenFor(USER_A, WORKSPACE_A), body: { mode } });
	assert.equal(patch.status, 200);
	await (await postRun(id, randomUUID(), 'make a plan')).text();
}

describe('plan mode', () => {
	it('keeps the reads, drops every write and the builder, and adds the plan block', async () => {
		await run('plan');
		const names = toolNames();
		assert.ok(names.includes('search_workspace') && names.includes('read_page'));
		for (const write of WRITES) assert.ok(!names.includes(write), write);
		assert.ok(!names.some((name) => name.startsWith('mcp_')));
		assert.ok(systemText().includes(PLAN_PROMPT_BLOCK));
	});

	it('a manual run keeps the writes and has no plan block', async () => {
		await run('manual');
		assert.ok(toolNames().includes('create_page'));
		assert.ok(!systemText().includes(PLAN_PROMPT_BLOCK));
	});
});

describe('keepPlanTools', () => {
	it('drops the write list, build_plan and mcp_* by name', () => {
		const set: ToolSet = {};
		for (const name of [...writeTools(true).map((tool) => tool.name), 'mcp_ab12cd34_x', 'read_page']) set[name] = {} as ToolSet[string];
		assert.deepEqual(Object.keys(keepPlanTools(set)), ['read_page']);
	});
});
