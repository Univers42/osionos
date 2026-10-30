import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * C291, the flag half: with OSIONOS_AI_MCP_CLIENT not exactly `on` (here `ON`,
 * C288) a run is byte-identical to a deployment that never had the client: the
 * same tool names in the same order, the same reservation, the same approval
 * kind. The literals are the snapshot taken before this slice; mcpRun.test.ts
 * holds the same literals for the flag on with no server.
 */
const { startHarness, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_MCP_CLIENT = 'ON';
	return import('./harness.ts');
})();
const { app, mock, bridge, postRun, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const SNAPSHOT_TOOLS = ['search_workspace', 'read_page', 'graph_neighbors', 'remember', 'open_page', 'open_panel', 'open_issue_report', 'suggest_agent', 'create_page', 'rename_page', 'archive_page', 'add_blocks'];
const SNAPSHOT_RESERVED = 234;

describe('C291 with the flag off, nothing differs from today', () => {
	it('C291 the tool set, the reservation and the approval kinds with the flag off', async () => {
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: null, toolCallTrigger: 'do it', toolCallEveryStep: false, parallelToolCalls: 1, usage: null });
		const runId = randomUUID();
		await collect(new SseStream(await postRun(await createConversation(), runId, 'do it', 'mock-metered')));
		const tools = ((mock.lastBody() as { tools?: { function?: { name?: string } }[] }).tools ?? []).map((tool) => tool.function?.name);
		assert.deepEqual(tools, SNAPSHOT_TOOLS);
		const row = (await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId])).rows[0];
		assert.equal(Number(row.reserved_microusd), SNAPSHOT_RESERVED);

		mock.setOptions({ toolCall: { name: 'create_page', arguments: { title: 'T', workspaceId: WORKSPACE_A } } });
		const events = await collect(new SseStream(await postRun(await createConversation(), randomUUID(), 'do it')));
		const asked = events.filter((event) => event.event === 'permission.asked').map((event) => event.data as Record<string, unknown>);
		assert.deepEqual(asked.map((card) => card.tool), ['create_page']);
		assert.equal('mcp' in asked[0], false);
	});
});
