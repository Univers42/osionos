import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { startMcpRoutes, WORKSPACE_A } from './mcpRoutesHarness.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * C308, at the merge of the MCP client (E1b) with custom agents (D3): both flags
 * on, the user has an enabled MCP tool, and still a custom agent's run is sent
 * no MCP tool, while every write tool it lists stops at an approval card. The
 * assertions read what the model was sent and what the run emitted.
 *
 * The environment is set before the harness imports the service.
 */
process.env.OSIONOS_AI_CUSTOM_AGENTS = 'on';
const { app, mock, bridge, fake, as, register, tokenOf, base } = await startMcpRoutes();
const { writeTools } = await import('../src/tools/writeToolList.ts');

const QUERY_SCHEMA = { type: 'object', properties: { q: { type: 'string' } }, required: ['q'], additionalProperties: false };

/** An owner of the workspace (so a user agent needs no switch) with one enabled MCP tool; its model name. */
async function armedOwner(): Promise<{ user: string; mcpName: string }> {
	const user = randomUUID();
	await app.db.query(
		"insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, 'owner', '{}')",
		[WORKSPACE_A, user],
	);
	const server = await fake({ tools: [{ name: 'lookup', inputSchema: QUERY_SCHEMA }] });
	const serverId = await register(user, server);
	assert.equal((await as(user, 'POST', `/api/ai/mcp-servers/${serverId}/discover`)).status, 200);
	assert.equal((await as(user, 'PATCH', `/api/ai/mcp-servers/${serverId}/tools/lookup`, { enabled: true })).status, 200);
	return { user, mcpName: `mcp_${serverId.replace(/-/g, '').slice(0, 8)}_lookup` };
}

/** A run of `user`, with the model making `call` on its first step. */
async function runAs(user: string, agentId: string | null, call: { name: string; arguments: Record<string, unknown> } | null): Promise<SseEvent[]> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: call,
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const created = await as(user, 'POST', '/api/ai/conversations', { workspaceId: WORKSPACE_A, title: 'thread' });
	assert.equal(created.status, 201);
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenOf(user)}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId: randomUUID(), conversationId: created.body?.id, text: 'do it', ...(agentId ? { agentId } : {}) }),
	});
	assert.equal(response.status, 200);
	return collect(new SseStream(response));
}

function toolNamesSent(): string[] {
	const tools = (mock.lastBody() as { tools?: { function?: { name?: unknown } }[] }).tools ?? [];
	return tools.map((tool) => String(tool.function?.name ?? ''));
}

/** A shared page of the workspace, known to the mock bridge too. */
async function page(owner: string): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
		 values ($1, $2, $3, 'The notes', 'shared', '[]'::jsonb)`,
		[id, WORKSPACE_A, owner],
	);
	bridge.seedPage(id, [], 3);
	return id;
}

/** Valid arguments per write tool. A write tool missing here fails the test, so a new one is never skipped. */
function argsFor(tool: string, pageId: string): Record<string, unknown> {
	const args: Record<string, Record<string, unknown>> = {
		create_page: { title: 'From agent', workspaceId: WORKSPACE_A },
		rename_page: { pageId, title: 'Renamed by agent' },
		archive_page: { pageId },
		add_blocks: { pageId, blocks: [{ type: 'paragraph', content: 'added by agent' }] },
	};
	const found = args[tool];
	assert.ok(found, `C308 has no arguments for the write tool ${tool}: add them`);
	return found;
}

describe('C308 MCP client and custom agents, merged', () => {
	it('C308 with both flags on, a custom agent is sent no MCP tool while the general assistant is', async () => {
		const { user, mcpName } = await armedOwner();
		const refused = await as(user, 'POST', '/api/ai/agents', { scope: 'user', name: 'Prober', instructions: 'Look it up.', tools: [mcpName] });
		assert.equal(refused.status, 422, 'an agent cannot list an MCP tool');
		const made = await as(user, 'POST', '/api/ai/agents', { scope: 'user', name: 'Reader', instructions: 'Read the page.', tools: ['read_page'] });
		assert.equal(made.status, 201);

		await runAs(user, null, null);
		assert.ok(toolNamesSent().includes(mcpName), 'the general assistant is sent the MCP tool');
		await runAs(user, String(made.body?.id), null);
		const sent = toolNamesSent();
		assert.ok(sent.includes('read_page'));
		assert.deepEqual(sent.filter((name) => name.startsWith('mcp_')), [], 'the custom agent is sent none');
	});

	it('C308 every write tool a custom agent lists stops at an approval card and writes nothing', async () => {
		const { user } = await armedOwner();
		const names = writeTools().map((tool) => tool.name);
		const made = await as(user, 'POST', '/api/ai/agents', { scope: 'user', name: 'Writer', instructions: 'Change the page.', tools: names });
		assert.equal(made.status, 201);
		for (const name of names) {
			const pageId = await page(user);
			const events = await runAs(user, String(made.body?.id), { name, arguments: argsFor(name, pageId) });
			const asked = events.filter((event) => event.event === 'permission.asked');
			assert.equal(asked.length, 1, `${name} asked once`);
			const data = asked[0].data as { approvalId: string; tool: string; agent: { kind: string } | null };
			assert.equal(data.tool, name);
			assert.equal(data.agent?.kind, 'custom', `${name}: the card names the custom agent`);
			const row = await app.db.query('select status from public.ai_approvals where id = $1', [data.approvalId]);
			assert.deepEqual(row.rows, [{ status: 'pending' }], `${name} waits for the user`);
			const after = await app.db.query('select title, archived_at, content from public.osionos_pages where id = $1', [pageId]);
			assert.deepEqual(after.rows, [{ title: 'The notes', archived_at: null, content: [] }], `${name} wrote nothing`);
		}
		const created = await app.db.query("select count(*)::int as n from public.osionos_pages where title = 'From agent' and owner_id = $1", [user]);
		assert.equal(created.rows[0].n, 0, 'create_page wrote nothing');
	});
});
