import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * Ten questions in one conversation, through the real HTTP path (osionos#310
 * AI-E2E, groot#155 "stops answering after a couple of questions"): only the
 * upstream model is the mock.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { HISTORY_CHAR_BUDGET } = await import('../src/runs/prompt.ts');
const { TOTAL_TIMEOUT_MS } = await import('../src/runs/streamPump.ts');

after(async () => {
	await app.close();
	await mock.close();
});

const TURNS = 10;

/** The text of every message of the last upstream request, in order. */
function sentTexts(body: unknown): string[] {
	const messages = (body as { messages: { content: unknown }[] }).messages;
	return messages.map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)));
}

/** The assistant texts persisted for a conversation, oldest first. */
async function storedAnswers(conversationId: string): Promise<string[]> {
	const rows = await app.db.query(
		`select parts from public.ai_messages where conversation_id = $1 and role = 'assistant' order by created_at, id`,
		[conversationId],
	);
	return rows.rows.map((row: { parts: { text: string }[] }) => row.parts[0]?.text ?? '');
}

/**
 * One turn: the run ends in done inside the service's own call timeout, the
 * reply is stored, and the one upstream call carried every earlier turn.
 *
 * Caveat: the time check is the 120 s ceiling, not a latency claim; a slow
 * turn under it passes.
 */
async function askAndCheck(conversationId: string, turn: number): Promise<void> {
	mock.setOptions({ answerText: `answer-${turn}` });
	const calls = mock.calls;
	const started = Date.now();
	const response = await postRun(conversationId, randomUUID(), `question-${turn}`);
	assert.equal(response.status, 200, await response.clone().text());
	const events = await collect(new SseStream(response));
	const last = events[events.length - 1];
	assert.equal(last?.event, 'done', `turn ${turn} ends in done, got ${JSON.stringify(last)}`);
	assert.ok(Date.now() - started < TOTAL_TIMEOUT_MS, `turn ${turn} inside the total timeout`);
	assert.equal(mock.calls - calls, 1, `turn ${turn} is one upstream call`);
	const sent = sentTexts(mock.lastBody()).join('\n');
	for (let earlier = 1; earlier < turn; earlier += 1) {
		assert.ok(sent.includes(`question-${earlier}`) && sent.includes(`answer-${earlier}`), `turn ${turn} carries turn ${earlier}`);
	}
	const answers = await storedAnswers(conversationId);
	assert.equal(answers.length, turn, `turn ${turn}: one stored reply per turn`);
	assert.equal(answers[turn - 1], `answer-${turn}`);
}

describe('ten questions in one conversation', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({ preDelayMs: 0, chunkGapMs: 0, fail: false, toolCall: null, usage: null });
	});

	it('every run ends in done, is stored, and carries the turns before it', async () => {
		const conversationId = await createConversation();
		let previousTexts = 0;
		for (let turn = 1; turn <= TURNS; turn += 1) {
			await askAndCheck(conversationId, turn);
			const texts = sentTexts(mock.lastBody());
			assert.ok(texts.length > previousTexts, `turn ${turn}: the history grew (${previousTexts} -> ${texts.length})`);
			previousTexts = texts.length;
		}
		const runs = await app.db.query('select status from public.ai_runs where conversation_id = $1', [conversationId]);
		assert.equal(runs.rowCount, TURNS);
		assert.ok(runs.rows.every((row: { status: string }) => row.status === 'succeeded'));
	});

	it('past the history window the oldest turns leave the prompt and the runs still end', async () => {
		const conversationId = await createConversation();
		const filler = 'x'.repeat(HISTORY_CHAR_BUDGET / 4);
		const turns = 10;
		for (let turn = 1; turn <= turns; turn += 1) {
			mock.setOptions({ answerText: `reply-${turn}` });
			const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), `q${turn}-${filler}`)));
			assert.equal(events[events.length - 1]?.event, 'done', `turn ${turn}`);
		}
		// The window is characters, newest first (src/runs/prompt.ts): the
		// first question is gone, the last one before this turn is kept.
		const sent = sentTexts(mock.lastBody()).join('\n');
		assert.ok(!sent.includes(`q1-${filler}`), 'the oldest question left the window');
		assert.ok(sent.includes(`q${turns - 1}-${filler}`), 'the previous question stayed');
		const historyChars = sentTexts(mock.lastBody()).filter((text) => text.includes(filler)).join('').length;
		assert.ok(historyChars <= HISTORY_CHAR_BUDGET + filler.length + 16, `history ${historyChars} stays near the budget`);
		assert.equal((await storedAnswers(conversationId)).length, turns, 'the transcript keeps every reply');
	});
});
