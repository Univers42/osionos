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
const { app, mock, bridge, postRun, tokenFor, createConversation } = await startHarness();

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

/** One conversation: the model reads `pageId`, and the run is drained. Returns the conversation. */
async function conversationReading(pageId: string): Promise<string> {
	const conversationId = await createConversation();
	mock.setOptions({ toolCall: { name: 'read_page', arguments: { pageId } } });
	const response = await postRun(conversationId, randomUUID(), 'read it', undefined, tokenFor(USER_A, WORKSPACE_A));
	await collect(new SseStream(response));
	return conversationId;
}

/**
 * C1 reads a hostile shared page; then, after the step-1 write is settled
 * (declined or approved by a click; nothing here depends on which), a new
 * conversation C2 reads the user's private page P.
 */
async function launderingSequence(): Promise<{ c1: string | null; c2: string | null }> {
	const hostile = await page('shared', USER_B);
	const privateP = await page('private', USER_A);
	const c1 = await conversationReading(hostile);
	const c2 = await conversationReading(privateP);
	return { c1: await reasonOf(c1), c2: await reasonOf(c2) };
}

describe('laundering sequence (taint state)', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_share_rules where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
	});

	it('the step-1 write is declined: C1 is tainted shared_page and C2 stays untainted', async () => {
		assert.deepEqual(await launderingSequence(), { c1: 'shared_page', c2: null });
	});

	it('the step-1 card is approved by a click: C2 still stays untainted', async () => {
		// The human-click case of Task 10's Caveat: an approved write lands the
		// hostile text in P, and a new conversation reading P is trusted, since
		// P is the user's own private page. The test pins this; it does not hide it.
		assert.deepEqual(await launderingSequence(), { c1: 'shared_page', c2: null });
	});
});
