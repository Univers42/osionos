import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * Research mode through the routes (h2-research-verdict.md): what is gated,
 * what the model is sent, what the stream carries. SearXNG is a fake on
 * 127.0.0.1 and web_search is the outbound call the cancel and the deadline
 * tests watch (the fetcher refuses loopback by design, so a page fetch cannot
 * be pointed at a fake here; its caps are in researchUnits.test.ts).
 */
let searches = 0;
let searchDelayMs = 0;
let onSearch: () => void = () => {};
const searxng = createServer((_request, response) => {
	searches += 1;
	onSearch();
	setTimeout(() => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ results: [{ url: 'https://docs.example.org/guide', title: 'Guide', content: 'How it works' }] }));
	}, searchDelayMs);
});
await new Promise<void>((resolve) => searxng.listen(0, '127.0.0.1', () => resolve()));
process.env.OSIONOS_AI_WEB = 'on';
process.env.OSIONOS_AI_RESEARCH = 'on';
process.env.OSIONOS_AI_SEARXNG_URL = `http://127.0.0.1:${(searxng.address() as AddressInfo).port}`;

const { startHarness } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor, call } = await startHarness();
// After the harness: these modules read the configuration, which the harness completes.
const { clock, RESEARCH_LIMITS } = await import('../src/tools/limits.ts');
const { STALE_RUN_MS } = await import('../src/runs/runner.ts');
const runStore = await import('../src/runs/runStore.ts');
const db = app.db as Pool;
const present = await db.query("select to_regclass('public.ai_workspace_web_settings') as settings");
const migrated = Boolean(present.rows[0]?.settings);

const WS = randomUUID();
const OFF_WS = randomUUID();
const users: string[] = [];

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

const namesOf = (body: unknown): string[] =>
	((body as { tools?: { function?: { name?: unknown } }[] }).tools ?? []).map((tool) => String(tool.function?.name));
const ofType = (events: SseEvent[], type: string) => events.filter((event) => event.event === type).map((event) => event.data as Record<string, unknown>);

/** A member of both workspaces, so each test has its own busy slot and its own day. */
async function newUser(): Promise<string> {
	const userId = randomUUID();
	await db.query(
		`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
		 values ($1, $3, 'owner', array['read']), ($2, $3, 'owner', array['read'])`,
		[WS, OFF_WS, userId],
	);
	users.push(userId);
	return userId;
}

interface Posted {
	runId: string;
	conversationId: string;
	response: Response;
}

async function post(userId: string, options: { workspaceId?: string; web?: boolean; mode?: string | null; model?: string; conversationId?: string } = {}): Promise<Posted> {
	const workspaceId = options.workspaceId ?? WS;
	const token = tokenFor(userId, workspaceId);
	const conversationId =
		options.conversationId ?? String((await call('/api/ai/conversations', { method: 'POST', token, body: { workspaceId, title: 'research' } })).body?.id);
	const runId = randomUUID();
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			runId,
			conversationId,
			text: 'go',
			...(options.mode === null ? {} : { mode: options.mode ?? 'research' }),
			...(options.model ? { model: options.model } : {}),
			context: { web: options.web ?? true },
		}),
	});
	return { runId, conversationId, response };
}

async function research(userId: string, options: Parameters<typeof post>[1] = {}): Promise<SseEvent[]> {
	const posted = await post(userId, options);
	assert.equal(posted.response.status, 200);
	return collect(new SseStream(posted.response));
}

function arm(options: Record<string, unknown> = {}): void {
	searches = 0;
	searchDelayMs = 0;
	onSearch = () => {};
	mock.setOptions({
		preDelayMs: 0, chunkCount: 1, chunkGapMs: 0, fail: false, usage: null, parallelToolCalls: 1, answerText: null,
		toolCall: { name: 'web_search', arguments: { query: 'zebra migration routes' } },
		toolCallTrigger: 'go', toolCallEveryStep: true,
		...options,
	});
}

async function idle(conversationId: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const running = await db.query("select 1 from public.ai_runs where conversation_id = $1 and status = 'running'", [conversationId]);
		if (running.rowCount === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

describe('research mode', { timeout: 180_000, skip: migrated ? false : 'the web migration was not applied' }, () => {
	before(async () => {
		const owner = await newUser();
		await db.query('insert into public.ai_workspace_web_settings (workspace_id, web_enabled, updated_by) values ($1, true, $2)', [WS, owner]);
	});

	it('C396 mode research is accepted; any other mode is a 400', async () => {
		arm({ toolCall: null });
		const events = await research(await newUser());
		assert.equal(events.at(-1)?.event, 'done');
		const bad = await post(await newUser(), { mode: 'deep' });
		assert.equal(bad.response.status, 400);
		await bad.response.body?.cancel();
	});

	it('C397 without the message toggle or the workspace switch: 400 research_needs_web, no model call', async () => {
		arm();
		const before = mock.calls;
		for (const options of [{ web: false }, { workspaceId: OFF_WS }]) {
			const posted = await post(await newUser(), options);
			assert.equal(posted.response.status, 400);
			assert.equal(((await posted.response.json()) as { error?: { code?: string } }).error?.code, 'research_needs_web');
		}
		assert.equal(mock.calls, before);
	});

	it('C398 the tool set is exactly four, absent rather than refused', async () => {
		arm({ toolCall: null });
		await research(await newUser());
		assert.deepEqual(namesOf(mock.lastBody()).sort(), ['read_page', 'search_workspace', 'web_fetch', 'web_search']);
	});

	it('C399 after 6.5 minutes the next step runs without tools and the run ends inside the stale window', async () => {
		arm();
		const realNow = clock.now;
		let offset = 0;
		clock.now = () => realNow() + offset;
		onSearch = () => { offset = 6.6 * 60_000; };
		try {
			const before = mock.calls;
			const events = await research(await newUser());
			assert.equal(events.at(-1)?.event, 'done');
			assert.equal(mock.calls - before, 2, 'one tool step, then the answer');
			assert.equal((mock.lastBody() as { tool_choice?: unknown }).tool_choice, 'none');
		} finally {
			clock.now = realNow;
		}
		assert.ok(RESEARCH_LIMITS.deadlineMs !== undefined && RESEARCH_LIMITS.deadlineMs < STALE_RUN_MS);
	});

	it('C401 a second run of the same user is a 429 research_busy before any reservation', async () => {
		arm({ toolCall: null, preDelayMs: 600 });
		const userId = await newUser();
		const before = mock.calls;
		const first = await post(userId);
		const stream = new SseStream(first.response);
		assert.equal((await stream.next())?.event, 'run.started');
		// The first run's model call is in flight (the mock counts it on arrival).
		for (let wait = 0; mock.calls === before && wait < 100; wait += 1) await new Promise((resolve) => setTimeout(resolve, 20));
		const second = await post(userId);
		assert.equal(second.response.status, 429);
		assert.equal(((await second.response.json()) as { error?: { code?: string } }).error?.code, 'research_busy');
		assert.equal(mock.calls, before + 1, 'only the first run reached the model');
		const rows = await db.query('select count(*)::int as n from public.ai_runs where id = $1', [second.runId]);
		assert.equal(rows.rows[0]?.n, 0);
		await collect(stream);
	});

	it('C402 a long answer is coalesced; a stale resume starts with resume.gap', async () => {
		arm({ toolCall: null, chunkCount: 400 });
		const userId = await newUser();
		const posted = await post(userId);
		const events = await collect(new SseStream(posted.response));
		const deltas = ofType(events, 'text.delta');
		assert.ok(deltas.length < 30, `${deltas.length} deltas for 400 chunks`);
		assert.equal(deltas.map((d) => d.text).join(''), mock.texts.at(-1));
		// The head of the stream is pushed out by later events (stand-in for a long report).
		const head = events[0]?.id ?? '';
		for (let index = 0; index < 2300; index += 1) await runStore.append(app.redis, posted.runId, 'research.progress', { filler: index });
		await runStore.append(app.redis, posted.runId, 'done', {});
		const resumed = await fetch(`${base}/api/ai/runs/${posted.runId}/events`, { headers: { authorization: `Bearer ${tokenFor(userId, WS)}`, 'last-event-id': head } });
		assert.equal((await new SseStream(resumed).next())?.event, 'resume.gap');
	});

	it('C404 over the day quota on the platform model: 429 research_quota and no upstream call', async () => {
		arm({ toolCall: null });
		const userId = await newUser();
		for (let n = 0; n < 3; n += 1) assert.equal((await research(userId)).at(-1)?.event, 'done');
		const before = mock.calls;
		const fourth = await post(userId);
		assert.equal(fourth.response.status, 429);
		assert.equal(((await fourth.response.json()) as { error?: { code?: string } }).error?.code, 'research_quota');
		assert.equal(mock.calls, before);
	});

	it('C405 a research run taints the conversation; a later normal run loses remember', async () => {
		arm();
		const userId = await newUser();
		const posted = await post(userId);
		await collect(new SseStream(posted.response));
		const row = (await db.query('select web_tainted_at, web_domains from public.ai_conversations where id = $1', [posted.conversationId])).rows[0];
		assert.ok(row?.web_tainted_at);
		assert.deepEqual(row?.web_domains, ['docs.example.org']);
		await idle(posted.conversationId);
		arm({ toolCall: { name: 'remember', arguments: { text: 'The user likes tea.' } }, toolCallEveryStep: false });
		const later = await post(userId, { mode: null, conversationId: posted.conversationId });
		const results = ofType(await collect(new SseStream(later.response)), 'tool.result');
		assert.equal(results.find((r) => r.toolName === 'remember')?.error, 'web_tainted');
	});

	it('C407 C412 C408 one plan, one progress per step, and a log line of counts only', async () => {
		arm();
		const lines: string[] = [];
		const realInfo = console.info;
		console.info = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
		let events: SseEvent[];
		try {
			events = await research(await newUser());
		} finally {
			console.info = realInfo;
		}
		const plans = ofType(events, 'research.plan');
		assert.equal(plans.length, 1);
		assert.deepEqual(plans[0]?.queries, ['zebra migration routes']);
		const progress = ofType(events, 'research.progress');
		assert.equal(progress.length, 12, 'every step of the cap reports once');
		assert.deepEqual(progress.map((p) => p.step), Array.from({ length: 12 }, (_, i) => i + 1));
		assert.equal(progress.at(-1)?.phase, 'write');
		const log = lines.filter((line) => line.includes('"research_run"'));
		assert.equal(log.length, 1);
		const parsed = JSON.parse(log[0] ?? '{}') as Record<string, unknown>;
		assert.deepEqual(Object.keys(parsed).sort(), ['bytes', 'code', 'deadline_hit', 'event', 'fetches', 'ms', 'searches', 'steps']);
		assert.equal(parsed.steps, 12);
		assert.equal(/zebra|docs\.example/.test(log[0] ?? ''), false);
	});

	it('C413 a cancel during a slow search: no further outbound request, no further model call', async () => {
		arm();
		searchDelayMs = 700;
		const userId = await newUser();
		const posted = await post(userId);
		const stream = new SseStream(posted.response);
		for (let event = await stream.next(); event?.event !== 'tool.called'; event = await stream.next()) {
			assert.ok(event, 'the stream ended before the tool call');
		}
		const cancel = await call(`/api/ai/runs/${posted.runId}/cancel`, { method: 'POST', token: tokenFor(userId, WS) });
		assert.equal(cancel.status, 202);
		await collect(stream);
		const [searchesAtCancel, callsAtCancel] = [searches, mock.calls];
		await new Promise((resolve) => setTimeout(resolve, 1000));
		assert.equal(searches, searchesAtCancel);
		assert.equal(mock.calls, callsAtCancel);
		assert.equal(searchesAtCancel, 1);
	});
});
