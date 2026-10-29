import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The card of a write, after a reload (C6).
 *
 * The stream of a run lives fifteen minutes: a client that comes back later
 * finds nothing to draw. The transcript is what carries the card then — the
 * assistant message of the run keeps a `permission` part, and the approval
 * id in it is what the client asks the service about.
 */
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** The events of a type. */
function eventsOf(events: SseEvent[], type: string): SseEvent[] {
	return events.filter((event) => event.event === type);
}

/** A run in which the model asks for a write. */
async function ask(tool: string, args: Record<string, unknown>): Promise<{
	approvalId: string;
	conversationId: string;
	events: SseEvent[];
}> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: tool, arguments: args },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const asked = eventsOf(events, 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	return {
		approvalId: String((asked[0].data as { approvalId: string }).approvalId),
		conversationId,
		events,
	};
}

/** The parts of the assistant message of a conversation. */
async function assistantParts(
	conversationId: string,
): Promise<Record<string, unknown>[]> {
	const answer = await call(`/api/ai/conversations/${conversationId}/messages`, {
		token: tokenFor(USER_A, WORKSPACE_A),
	});
	assert.equal(answer.status, 200);
	const messages = (answer.body?.messages ?? []) as { role: string; parts: Record<string, unknown>[] }[];
	const assistant = messages.find((message) => message.role === 'assistant');
	assert.ok(assistant, 'the conversation carries the answer of the run');
	return assistant.parts;
}

describe('the card of a write, after a reload', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('the assistant message keeps the approval id of the write', async () => {
		const { approvalId, conversationId } = await ask('create_page', {
			title: 'The report',
			workspaceId: WORKSPACE_A,
		});
		const parts = await assistantParts(conversationId);
		const permission = parts.find((part) => part.type === 'permission');
		assert.ok(permission, 'the answer carries the card of the write');
		assert.equal(permission?.approvalId, approvalId, 'the card is found by its id');
		assert.equal(permission?.tool, 'create_page');
	});

	it('the card is rebuilt from the row, with the arguments (C6)', async () => {
		const { approvalId } = await ask('create_page', {
			title: 'The report of the week',
			workspaceId: WORKSPACE_A,
		});
		const answer = await call(`/api/ai/approvals/${approvalId}`, {
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(answer.status, 200);
		const body = answer.body as { approvalId: string; status: string; args: Record<string, unknown> };
		assert.equal(body.approvalId, approvalId);
		assert.equal(body.status, 'pending');
		assert.equal(body.args.title, 'The report of the week', 'the arguments come back as they were asked');
	});

	it('a run that asks for nothing keeps no card', async () => {
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 2,
			chunkGapMs: 0,
			fail: false,
			toolCall: null,
			toolCallTrigger: null,
			toolCallEveryStep: false,
			parallelToolCalls: 1,
			usage: null,
		});
		const conversationId = await createConversation();
		await collect(new SseStream(await postRun(conversationId, randomUUID(), 'just talk')));
		const parts = await assistantParts(conversationId);
		assert.equal(
			parts.filter((part) => part.type === 'permission').length,
			0,
			'no card, no part',
		);
	});
});
