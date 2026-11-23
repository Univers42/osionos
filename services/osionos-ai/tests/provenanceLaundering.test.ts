/**
 * The laundering sequence of AM3, as far as Task 11 reaches: the taint state.
 * The pending / cardReason='tainted' / applied assertions arrive with Task 15,
 * which extends `launderingSequence` below.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = '11111111-1111-4111-8111-111111111111';
const { startHarness, USER_A, USER_B, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, postRun, tokenFor, createConversation, call } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function page(visibility: string, ownerId: string): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 't', $4, '[{"content":"body"}]'::jsonb)`,
		[id, WORKSPACE_A, ownerId, visibility],
	);
	return id;
}

async function reasonOf(conversationId: string): Promise<string | null> {
	const row = await app.db.query('select provenance_reason from public.ai_conversations where id = $1', [conversationId]);
	return row.rows[0].provenance_reason;
}

const HOSTILE_BLOCK = 'HOSTILE-INSTRUCTION-BLOCK';

async function resetMock(toolCall: unknown): Promise<void> {
	mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: toolCall as never, toolCallTrigger: null, toolCallEveryStep: false, parallelToolCalls: 1, usage: null });
}

async function drained(conversationId: string): Promise<{ events: Awaited<ReturnType<typeof collect>> }> {
	const response = await postRun(conversationId, randomUUID(), 'do it', undefined, tokenFor(USER_A, WORKSPACE_A));
	return { events: await collect(new SseStream(response)) };
}

async function setAuto(conversationId: string): Promise<void> {
	const set = await call(`/api/ai/conversations/${conversationId}/mode`, { method: 'PATCH', token: tokenFor(USER_A, WORKSPACE_A), body: { mode: 'auto' } });
	assert.equal(set.status, 200);
}

/** Step 1: C1 reads the hostile shared page and asks add_blocks on P: a pending card. */
async function hostileReadThenWrite(hostile: string, privateP: string, auto = false): Promise<{ c1: string; approvalId: string }> {
	await resetMock({
		name: 'read_page',
		arguments: { pageId: hostile },
		also: [{ name: 'add_blocks', arguments: { pageId: privateP, blocks: [{ type: 'paragraph', content: HOSTILE_BLOCK }] } }],
	});
	const c1 = await createConversation();
	if (auto) await setAuto(c1);
	const { events } = await drained(c1);
	const asked = events.filter((event) => event.event === 'permission.asked');
	assert.equal(asked.length, 1, 'step 1 asked for one card');
	return { c1, approvalId: String((asked[0].data as { approvalId: string }).approvalId) };
}

/** Steps 2 and 4: the user settles the card through the approval route. */
async function decide(approvalId: string, decision: 'approve' | 'decline'): Promise<string> {
	const answer = await call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { decision } });
	assert.equal(answer.status, 200);
	return String((answer.body as { status: string }).status);
}

/** Step 3: a new conversation C2 reads P. */
async function readPInFreshConversation(privateP: string): Promise<string> {
	await resetMock({ name: 'read_page', arguments: { pageId: privateP } });
	const c2 = await createConversation();
	await drained(c2);
	return c2;
}

function blocksOf(pageId: string): string[] {
	return (bridge.pageContent(pageId)?.content ?? []).map((block) => String((block as { content?: unknown }).content));
}

async function setup(): Promise<{ hostile: string; privateP: string }> {
	bridge.reset();
	const hostile = await page('shared', USER_B);
	const privateP = await page('private', USER_A);
	bridge.seedPage(privateP, [], 3);
	return { hostile, privateP };
}

describe('laundering sequence (taint state)', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.ai_approvals');
		await app.db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_share_rules where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
	});

	it('declined: C1 is tainted shared_page, P holds nothing of step 1, C2 stays untainted', async () => {
		const { hostile, privateP } = await setup();
		const { c1, approvalId } = await hostileReadThenWrite(hostile, privateP);
		assert.equal(await reasonOf(c1), 'shared_page');
		assert.equal(await decide(approvalId, 'decline'), 'declined');
		assert.deepEqual(blocksOf(privateP), []);
		assert.equal(await reasonOf(await readPInFreshConversation(privateP)), null);
	});

	it('approved by a click: P holds the step-1 blocks and C2 still stays untainted', async () => {
		// The human-click case of Task 10's Caveat: the approved write lands the
		// hostile text in P, and a new conversation reading P is trusted, because
		// P is the user's own private page. Pinned here, not hidden.
		const { hostile, privateP } = await setup();
		const { c1, approvalId } = await hostileReadThenWrite(hostile, privateP);
		assert.equal(await reasonOf(c1), 'shared_page');
		assert.equal(await decide(approvalId, 'approve'), 'executed');
		assert.deepEqual(blocksOf(privateP), [HOSTILE_BLOCK]);
		assert.equal(await reasonOf(await readPInFreshConversation(privateP)), null);
	});

	it('auto: a conversation tainted by the hostile read does not apply the write; the card says tainted', async () => {
		const { hostile, privateP } = await setup();
		const { c1, approvalId } = await hostileReadThenWrite(hostile, privateP, true);
		assert.equal(await reasonOf(c1), 'shared_page');
		const row = (await app.db.query('select status, decided_by from public.ai_approvals where id = $1', [approvalId])).rows[0];
		assert.deepEqual(row, { status: 'pending', decided_by: null });
		assert.deepEqual(blocksOf(privateP), []);
		assert.equal(bridge.calls.length, 0);
	});

	it('auto: the tainted card carries cardReason tainted', async () => {
		const { hostile, privateP } = await setup();
		await resetMock({
			name: 'read_page',
			arguments: { pageId: hostile },
			also: [{ name: 'add_blocks', arguments: { pageId: privateP, blocks: [{ type: 'paragraph', content: HOSTILE_BLOCK }] } }],
		});
		const c1 = await createConversation();
		await setAuto(c1);
		const { events } = await drained(c1);
		const asked = events.filter((event) => event.event === 'permission.asked');
		assert.equal((asked[0].data as { cardReason?: string }).cardReason, 'tainted');
	});

	it('contrast: a clean auto conversation applies the same write', async () => {
		const { privateP } = await setup();
		await resetMock({ name: 'add_blocks', arguments: { pageId: privateP, blocks: [{ type: 'paragraph', content: 'clean' }] } });
		const c = await createConversation();
		await setAuto(c);
		const { events } = await drained(c);
		assert.equal(events.filter((event) => event.event === 'permission.asked').length, 0);
		assert.equal(await reasonOf(c), null);
		assert.deepEqual(blocksOf(privateP), ['clean']);
	});
});
