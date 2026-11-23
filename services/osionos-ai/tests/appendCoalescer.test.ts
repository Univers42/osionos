/**
 * Appends to one page within a step merge into one bridge call (AM6), and the
 * per-turn cap holds across a decided continuation.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

const USER_ALLOWED = '11111111-1111-4111-8111-111111111111';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_ALLOWED;
process.env.OSIONOS_AI_AUTO_PER_TURN = '3';

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, postRun, tokenFor, createConversation } = await startHarness();
const { COALESCE_WINDOW_MS } = await import('../src/approvals/appendCoalescer.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const token = tokenFor(USER_A, WORKSPACE_A);

async function page(): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 't', 'private', '[]'::jsonb)`,
		[id, WORKSPACE_A, USER_A],
	);
	bridge.seedPage(id, [], 1);
	return id;
}

const add = (pageId: string, text: string) => ({ name: 'add_blocks', arguments: { pageId, blocks: [{ type: 'paragraph', content: text }] } });

/** One step of parallel calls: the first call carries the rest in `also`. */
const step = (calls: Array<{ name: string; arguments: Record<string, unknown> }>) => ({ ...calls[0], also: calls.slice(1) });

function script(steps: unknown[]): void {
	mock.setOptions({
		preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: null, toolCallTrigger: null,
		toolCallEveryStep: false, parallelToolCalls: 1, usage: null, beforeStep: null, toolCallScript: steps as never,
	});
}

async function autoConversation(): Promise<string> {
	const id = await createConversation();
	assert.equal((await call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token, body: { mode: 'auto' } })).status, 200);
	return id;
}

const run = async (id: string): Promise<SseEvent[]> => collect(new SseStream(await postRun(id, randomUUID(), 'do it', undefined, token)));
const appends = () => bridge.calls.filter((c) => c.method === 'POST' && /\/blocks$/.test(c.path));

interface Stored { id: string; status: string; result: { blocks?: Array<{ id: string }> } | null; args: { blocks: Array<{ content: string }> } }
const rowsOf = async (conversationId: string): Promise<Stored[]> =>
	(await app.db.query('select id, status, result, args from public.ai_approvals where conversation_id = $1 order by created_at, id', [conversationId])).rows;

describe('appends to one page in one step (AM6)', () => {
	beforeEach(() => {
		bridge.reset();
		mock.setOptions({ beforeStep: null, toolCallScript: null });
	});

	it('the window is 25 ms', () => assert.equal(COALESCE_WINDOW_MS, 25));

	it('three parallel add_blocks reach the bridge as one call; each row keeps its own ids, in order', async () => {
		const target = await page();
		const id = await autoConversation();
		script([step([add(target, 'a'), add(target, 'b'), add(target, 'c')])]);
		const events = await run(id);
		assert.equal(events.filter((e) => e.event === 'write.applied').length, 3);
		assert.equal(appends().length, 1, 'one append call');
		const sent = (appends()[0].body as { blocks: Array<{ id: string; content: string }>; idempotencyKey: string });
		// The rows are made by parallel tool calls: their order is the order they reached the coalescer.
		assert.deepEqual(sent.blocks.map((b) => b.content).sort(), ['a', 'b', 'c']);
		const rows = await rowsOf(id);
		assert.deepEqual(rows.map((r) => r.status), ['executed', 'executed', 'executed']);
		const byContent = new Map(rows.map((r) => [r.args.blocks[0].content, r]));
		assert.equal(sent.idempotencyKey, byContent.get(sent.blocks[0].content)?.id, 'the first row id is the key');
		for (const [index, block] of sent.blocks.entries()) {
			assert.deepEqual(byContent.get(block.content)?.result?.blocks?.map((b) => b.id), [sent.blocks[index].id]);
		}
		assert.equal(new Set(rows.flatMap((r) => r.result?.blocks?.map((b) => b.id) ?? [])).size, 3, 'disjoint ids');
		const replay = await fetch(`${bridge.baseUrl}${appends()[0].path}`, {
			method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(sent),
		});
		assert.equal(replay.status, 200);
		assert.equal(bridge.pageContent(target)?.content.length, 3, 'the replay appended nothing');
	});

	it('appends to two pages are two calls', async () => {
		const [a, b] = [await page(), await page()];
		const id = await autoConversation();
		script([step([add(a, 'a'), add(b, 'b')])]);
		await run(id);
		assert.equal(appends().length, 2);
		assert.deepEqual((await rowsOf(id)).map((r) => r.status), ['executed', 'executed']);
	});

	it('a failed merged append fails every row of the batch, none stays executing', async () => {
		const target = await page();
		const id = await autoConversation();
		script([step([add(target, 'a'), add(target, 'b')])]);
		bridge.failWith = 500;
		try {
			await run(id);
		} finally {
			bridge.failWith = 0;
		}
		const statuses = (await rowsOf(id)).map((r) => r.status);
		assert.equal(statuses.length, 2);
		assert.ok(statuses.every((s) => s === 'failed' || s === 'unknown'), statuses.join());
	});
});

describe('the turn cap across a decided continuation (AM6)', () => {
	it('autoPerTurn=3: 2 writes, then a decided continuation with 2 writes: the 4th is a turn_cap card', async () => {
		bridge.reset();
		const [a, b, c, d] = [await page(), await page(), await page(), await page()];
		const id = await autoConversation();
		const archive = { name: 'archive_page', arguments: { pageId: await page() } };
		script([step([add(a, '1'), add(b, '2')]), archive, step([add(c, '3'), add(d, '4')])]);
		const first = await run(id);
		const card = first.find((e) => e.event === 'permission.asked');
		assert.ok(card, 'the ineligible archive is a card');
		const approvalId = (card.data as { approvalId: string }).approvalId;
		const answer = await call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token, body: { decision: 'approve' } });
		assert.equal(answer.status, 200);
		const continuation = String((answer.body as { continuationRunId: string | null }).continuationRunId);
		for (let wait = 0; wait < 200; wait += 1) {
			const { rows } = await app.db.query('select status from public.ai_runs where id = $1', [continuation]);
			if (rows[0] && rows[0].status !== 'running') break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		const turns = await app.db.query('select count(distinct turn_id)::int as n from public.ai_runs where conversation_id = $1', [id]);
		assert.equal(turns.rows[0].n, 1, 'the continuation shares the turn');
		const rows = (await app.db.query("select status, decided_by from public.ai_approvals where conversation_id = $1 and tool = 'add_blocks' order by created_at, id", [id])).rows;
		assert.equal(rows.filter((r) => r.decided_by?.startsWith('auto:')).length, 3, JSON.stringify(rows));
		assert.equal(rows.filter((r) => r.status === 'pending').length, 1, 'the 4th write waits for a human');
		const asked = JSON.stringify(mock.bodies.slice(-2));
		assert.ok(asked.includes('the limit of automatic edits for this turn was reached'), 'the card says turn_cap');
	});
});
