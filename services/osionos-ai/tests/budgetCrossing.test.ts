import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, PLATFORM, USER_A, USER_DAILY_MICROUSD } from './harness.ts';
import type { JsonBody } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * A run that crosses the daily budget while it streams (osionos#310
 * AI-BUDGET). The contract the code has: the budget is a PRE-check
 * (reserve, src/runs/runner.ts:423) and a settlement at the REAL cost
 * (src/budget.ts settleOn); the stream is never cut for money. So the
 * crossing run ends in `done`, the ledger books the real cost over the cap,
 * and the NEXT run is refused with 402 budget_exhausted.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { estimateRunMicroUsd } = await import('../src/runs/estimate.ts');

after(async () => {
	// The next file shares this database: an over-cap ledger would refuse its runs (402).
	await app.db.query('delete from public.ai_usage_daily');
	await app.close();
	await mock.close();
});

async function setLeft(left: number): Promise<void> {
	await app.db.query(
		`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
		 values ($1, current_date, $2, 0)
		 on conflict (subject, day) do update set spent_microusd = $2, reserved_microusd = 0`,
		[USER_A, USER_DAILY_MICROUSD - left],
	);
}

async function ledger(): Promise<{ spent: number; reserved: number }> {
	const result = await app.db.query(
		'select spent_microusd, reserved_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
		[USER_A],
	);
	return { spent: Number(result.rows[0].spent_microusd), reserved: Number(result.rows[0].reserved_microusd) };
}

describe('a run that crosses the daily budget while it streams', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		// 50 000 tokens in and 5 000 out at the platform price cost 225 000
		// micro-USD, more than the whole day (200 000) and than the run reserved.
		mock.setOptions({
			preDelayMs: 0, chunkCount: 8, chunkGapMs: 5, fail: false, toolCall: null, answerText: null,
			usage: { promptTokens: 50_000, completionTokens: 5_000 },
		});
	});

	it('ends in done with its reply stored, and books the real cost over the cap', async () => {
		await setLeft(estimateRunMicroUsd(PLATFORM, { text: 'cross', historyChars: 0 }));
		const conversationId = await createConversation();
		const runId = randomUUID();
		const events = await collect(new SseStream(await postRun(conversationId, runId, 'cross', PLATFORM.id)));

		const last = events[events.length - 1];
		assert.equal(last?.event, 'done', `a terminal event, got ${JSON.stringify(last)}`);
		assert.ok(events.some((event) => event.event === 'text.delta'), 'the text streamed');
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.equal(run.rows[0].status, 'succeeded');
		const stored = await app.db.query(`select 1 from public.ai_messages where conversation_id = $1 and role = 'assistant'`, [conversationId]);
		assert.equal(stored.rowCount, 1, 'the reply is not half-written');
		const books = await ledger();
		assert.equal(books.reserved, 0, 'no reservation is left held');
		assert.ok(books.spent > USER_DAILY_MICROUSD, `the real cost is booked: ${books.spent}`);
	});

	it('refuses the next run with 402 budget_exhausted before any model call', async () => {
		const conversationId = await createConversation();
		const calls = mock.calls;
		const response = await postRun(conversationId, randomUUID(), 'one more', PLATFORM.id);
		assert.equal(response.status, 402);
		assert.equal(((await response.json()) as JsonBody).code, 'budget_exhausted');
		assert.equal(mock.calls, calls, 'the model is not called');
	});
});
