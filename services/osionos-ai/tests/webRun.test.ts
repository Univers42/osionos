import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The web tools inside a run, through the routes (h2-web-verdict.md): the
 * three layers (C355), agents (C369), the taint written to the conversation
 * (C358) and what it switches off in later runs (C359). SearXNG is a fake on
 * 127.0.0.1; what the model was SENT is read from the mock upstream.
 */
let searches = 0;
const searxng = createServer((request, response) => {
	searches += 1;
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify({ results: [{ url: 'https://docs.example.org/guide', title: 'Guide', content: 'How it works' }] }));
});
await new Promise<void>((resolve) => searxng.listen(0, '127.0.0.1', () => resolve()));
process.env.OSIONOS_AI_WEB = 'on';
process.env.OSIONOS_AI_SEARXNG_URL = `http://127.0.0.1:${(searxng.address() as AddressInfo).port}`;

const { startHarness } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor, call } = await startHarness();
const db = app.db as Pool;
const present = await db.query("select to_regclass('public.ai_workspace_web_settings') as settings");
const migrated = Boolean(present.rows[0]?.settings);

const WS = randomUUID();
const OFF_WS = randomUUID();
const USER = randomUUID();

after(async () => {
	if (migrated) {
		await db.query('delete from public.ai_workspace_web_settings where workspace_id = any($1)', [[WS, OFF_WS]]);
		await db.query('delete from public.osionos_workspace_members where workspace_id = any($1)', [[WS, OFF_WS]]);
	}
	await app.close();
	await mock.close();
	await bridge.close();
	await new Promise((resolve) => searxng.close(resolve));
});

function toolNamesOf(body: unknown): string[] {
	const tools = (body as { tools?: { function?: { name?: unknown } }[] }).tools ?? [];
	return tools.map((tool) => String(tool.function?.name ?? ''));
}

const resultsOf = (events: SseEvent[]) =>
	events.filter((event) => event.event === 'tool.result').map((event) => event.data as Record<string, unknown>);
const askedOf = (events: SseEvent[]) =>
	events.filter((event) => event.event === 'permission.asked').map((event) => event.data as Record<string, unknown>);

async function conversationIn(workspaceId: string): Promise<string> {
	const created = await call('/api/ai/conversations', { method: 'POST', token: tokenFor(USER, workspaceId), body: { workspaceId, title: 'web' } });
	assert.equal(created.status, 201);
	return String(created.body?.id);
}

/** One run; `toolCall` is what the model calls on its first step. */
async function run(
	conversationId: string,
	workspaceId: string,
	options: { web?: boolean; agentId?: string; toolCall?: { name: string; arguments: Record<string, unknown> } | null } = {},
): Promise<SseEvent[]> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 1,
		chunkGapMs: 0,
		fail: false,
		toolCall: options.toolCall ?? null,
		toolCallTrigger: 'go',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(USER, workspaceId)}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			runId: randomUUID(),
			conversationId,
			text: 'go',
			...(options.agentId ? { agentId: options.agentId } : {}),
			...(options.web === undefined ? {} : { context: { web: options.web } }),
		}),
	});
	assert.equal(response.status, 200);
	return collect(new SseStream(response));
}

async function idle(conversationId: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const running = await db.query("select 1 from public.ai_runs where conversation_id = $1 and status = 'running'", [conversationId]);
		if (running.rowCount === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

describe('the web tools in a run', { timeout: 120_000, skip: migrated ? false : 'the web migration was not applied' }, () => {
	before(async () => {
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $3, 'owner', array['read']), ($2, $3, 'owner', array['read'])`,
			[WS, OFF_WS, USER],
		);
		await db.query('insert into public.ai_workspace_web_settings (workspace_id, web_enabled, updated_by) values ($1, true, $2)', [WS, USER]);
	});

	it('C355 every layer on: web_search and web_fetch are sent', async () => {
		await run(await conversationIn(WS), WS, { web: true });
		const names = toolNamesOf(mock.lastBody());
		assert.ok(names.includes('web_search') && names.includes('web_fetch'), names.join(','));
	});

	it('C355 the toggle off, or absent, or the switch off: the tools are absent, not refused', async () => {
		await run(await conversationIn(WS), WS, { web: false });
		assert.equal(toolNamesOf(mock.lastBody()).some((name) => name.startsWith('web_')), false);
		await run(await conversationIn(WS), WS);
		assert.equal(toolNamesOf(mock.lastBody()).some((name) => name.startsWith('web_')), false);
		await run(await conversationIn(OFF_WS), OFF_WS, { web: true });
		assert.equal(toolNamesOf(mock.lastBody()).some((name) => name.startsWith('web_')), false);
	});

	it('C369 an agent never gets the web tools, even with every layer on', async () => {
		await run(await conversationIn(WS), WS, { web: true, agentId: 'analyst' });
		assert.equal(toolNamesOf(mock.lastBody()).some((name) => name.startsWith('web_')), false);
	});

	it('C358 C359 a search taints the conversation; later runs lose remember and their write cards name the domain', async () => {
		const conversationId = await conversationIn(WS);
		const before = searches;
		const first = await run(conversationId, WS, { web: true, toolCall: { name: 'web_search', arguments: { query: 'osionos guide' } } });
		assert.equal(searches, before + 1);
		assert.equal(resultsOf(first).find((result) => result.toolName === 'web_search')?.ok, true);
		const row = (await db.query('select web_tainted_at, web_domains from public.ai_conversations where id = $1', [conversationId])).rows[0];
		assert.ok(row?.web_tainted_at, 'the conversation is marked');
		assert.deepEqual(row?.web_domains, ['docs.example.org']);
		const citation = first.find((event) => event.event === 'citation')?.data as Record<string, unknown> | undefined;
		assert.equal(citation?.collection, 'web');
		assert.equal(citation?.url, 'https://docs.example.org/guide');
		await idle(conversationId);

		// A later run, web toggle OFF: the taint still holds.
		const second = await run(conversationId, WS, { toolCall: { name: 'remember', arguments: { text: 'The user likes tea.' } } });
		const remembered = resultsOf(second).find((result) => result.toolName === 'remember');
		assert.equal(remembered?.ok, false);
		assert.equal(remembered?.error, 'web_tainted');
		assert.equal(second.some((event) => event.event === 'memory.proposed'), false);
		await idle(conversationId);

		const third = await run(conversationId, WS, { toolCall: { name: 'create_page', arguments: { title: 'T', workspaceId: WS } } });
		const [asked] = askedOf(third);
		assert.deepEqual(asked?.influencedBy, ['web:docs.example.org']);
		const described = await call(`/api/ai/approvals/${String(asked?.approvalId)}`, { token: tokenFor(USER, WS) });
		assert.deepEqual(described.body?.influencedBy, ['web:docs.example.org']);
	});

	it('C359 a conversation that never read the web keeps remember and has no influencedBy', async () => {
		const conversationId = await conversationIn(WS);
		const events = await run(conversationId, WS, { toolCall: { name: 'create_page', arguments: { title: 'T', workspaceId: WS } } });
		const [asked] = askedOf(events);
		assert.ok(asked);
		assert.equal('influencedBy' in asked, false);
	});
});
