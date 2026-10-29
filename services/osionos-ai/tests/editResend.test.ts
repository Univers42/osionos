import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * Edit and resend: a run that names `replaceFromRunId` drops that run's turn
 * and everything after it BEFORE the history is built, so the model never
 * receives what the user edited away.
 */
const { app, base, mock, tokenFor, postRun, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

function replaceRun(conversationId: string, runId: string, text: string, extra: Record<string, unknown>, token?: string) {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token ?? tokenFor(USER_A, WORKSPACE_A)}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ runId, conversationId, text, ...extra }),
	});
}

async function transcript(conversationId: string): Promise<string[]> {
	const rows = await app.db.query(
		'select role, parts from public.ai_messages where conversation_id = $1 order by created_at, id',
		[conversationId],
	);
	return rows.rows
		.filter((row: { role: string }) => row.role === 'user')
		.map((row: { parts: { text: string }[] }) => row.parts[0]?.text ?? '');
}

describe('osionos-ai edit and resend', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false });
	});

	async function twoTurns() {
		const conversationId = await createConversation();
		const runA = randomUUID();
		const runB = randomUUID();
		await collect(new SseStream(await postRun(conversationId, runA, 'question-A')));
		await collect(new SseStream(await postRun(conversationId, runB, 'question-B')));
		return { conversationId, runA, runB };
	}

	it('the model never receives the replaced turn, and the transcript keeps the rest', async () => {
		const { conversationId, runB } = await twoTurns();
		await collect(new SseStream(await replaceRun(conversationId, randomUUID(), 'question-B2', { replaceFromRunId: runB })));

		const sent = JSON.stringify(mock.lastBody());
		assert.ok(sent.includes('question-A'), 'A stays in the prompt');
		assert.ok(sent.includes('question-B2'));
		assert.ok(!sent.includes('question-B"'), 'the edited-away question is not sent');
		assert.deepEqual(await transcript(conversationId), ['question-A', 'question-B2']);
	});

	it('a run of another user is a 404 with no upstream call and no delete', async () => {
		const { conversationId, runB } = await twoTurns();
		const calls = mock.calls;
		const res = await replaceRun(
			conversationId,
			randomUUID(),
			'x',
			{ replaceFromRunId: runB },
			tokenFor(USER_B, WORKSPACE_B),
		);
		assert.equal(res.status, 404);
		assert.equal(mock.calls, calls);
		assert.deepEqual(await transcript(conversationId), ['question-A', 'question-B']);
	});

	it('an unknown run is a 404, the conversation is not left running, nothing is deleted', async () => {
		const { conversationId } = await twoTurns();
		const calls = mock.calls;
		const res = await replaceRun(conversationId, randomUUID(), 'x', { replaceFromRunId: randomUUID() });
		assert.equal(res.status, 404);
		assert.equal((await res.json() as { code: string }).code, 'not_found');
		assert.equal(mock.calls, calls);
		assert.deepEqual(await transcript(conversationId), ['question-A', 'question-B']);
		const again = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'still works')));
		assert.equal(again[again.length - 1]?.event, 'done');
	});

	it('replaceFromRunId without a conversationId is a 400', async () => {
		const res = await fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), text: 'x', replaceFromRunId: randomUUID() }),
		});
		assert.equal(res.status, 400);
		assert.equal((await res.json() as { code: string }).code, 'invalid_request');
	});
});
