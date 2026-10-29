import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, METERED, PLATFORM, USER_A, USER_DAILY_MICROUSD } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The money of a step, and the money of the answer that follows it.
 *
 * The answer reads what the tools of the step add, so the ceiling of the
 * answer carries it. And the money never cuts a run after a tool call: the
 * step that the run cannot pay for becomes the answer, and the loop is
 * bounded by the cap of the steps alone.
 *
 * The extension of the reservation of a run is ONE transaction: the money of
 * the day and the row of the run move together, or neither moves.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { config } = await import('../src/config.ts');
const { platformModel } = await import('../src/gateway/platform.ts');
const { estimateRunMicroUsd, promptCharCount, stepCeilingMicroUsd, stepCeilingsMicroUsd, stepPromptChars } =
	await import('../src/runs/estimate.ts');
const { extendRunReservation } = await import('../src/runs/extend.ts');
const { today } = await import('../src/runs/runner.ts');
const { TOOL_DEFINITION_CHARS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS } = await import('../src/tools/index.ts');

after(async () => {
	await app.close();
	await mock.close();
});

/** The money the user has left today, in micro-USD. */
async function setLeft(left: number): Promise<void> {
	await app.db.query(
		`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
		 values ($1, current_date, $2, 0)
		 on conflict (subject, day) do update set spent_microusd = $2, reserved_microusd = 0`,
		[USER_A, USER_DAILY_MICROUSD - left],
	);
}

/** The row of the ledger of the user, as it is. */
async function ledgerRow(): Promise<{ spent: number; reserved: number } | null> {
	const result = await app.db.query(
		'select spent_microusd, reserved_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
		[USER_A],
	);
	const row = result.rows[0];
	if (!row) return null;
	return { spent: Number(row.spent_microusd), reserved: Number(row.reserved_microusd) };
}

/** The tool choice the service asked for, in a body of the mock. */
function toolChoiceOf(body: unknown): string | undefined {
	return (body as { tool_choice?: string } | null)?.tool_choice;
}

/** The text of the deltas of a list of events. */
function textOf(events: SseEvent[]): string {
	return events
		.filter((event) => event.event === 'text.delta')
		.map((event) => (event.data as { text: string }).text)
		.join('');
}

describe('the money of a step, and of the answer that follows it', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 4,
			chunkGapMs: 0,
			fail: false,
			toolCall: null,
			toolCallEveryStep: false,
			parallelToolCalls: 1,
			usage: null,
			usageOnFirstStepOnly: false,
		});
	});

	it('the answer is paid for with what the tools add', () => {
		// The price of the platform model: three micro-USD a thousand tokens
		// in, fifteen out, and a step may write 1024 tokens.
		const input = (chars: number) => 3 * Math.ceil(chars / 4);
		const output = 15 * config.maxOutputTokens;
		// The prompt of the run: the question and the system prompt.
		const base = promptCharCount({ text: 'hello', historyChars: 0 });
		// The definitions of the tools travel with every step.
		const defs = TOOL_DEFINITION_CHARS;
		// The ceiling of a step whose prompt holds `pool` characters of tool
		// output.
		const ceiling = (pool: number) => input(base + pool + defs) + output;
		// The pool of the run, and the share of one step.
		assert.equal(TOOL_POOL_CHARS, 4 * TOOL_OUTPUT_CHARS);
		assert.equal(TOOL_OUTPUT_CHARS, 20_000);

		// p = 0: the answer reads the share of the step that follows it.
		assert.equal(
			stepCeilingsMicroUsd(PLATFORM, { baseChars: base, pool: 0 }).needed,
			ceiling(0) + ceiling(20_000),
		);
		// p = 20 000: the answer reads the pool and the share of the step.
		assert.equal(
			stepCeilingsMicroUsd(PLATFORM, { baseChars: base, pool: 20_000 }).needed,
			ceiling(20_000) + ceiling(40_000),
		);
		// p = 60 000: the pool has room for one share more, and the answer
		// reads the pool and that share.
		assert.equal(
			stepCeilingsMicroUsd(PLATFORM, { baseChars: base, pool: 60_000 }).needed,
			ceiling(60_000) + ceiling(80_000),
		);
		// p = 80 000: the pool is full: the answer reads the pool and
		// nothing more.
		assert.equal(
			stepCeilingsMicroUsd(PLATFORM, { baseChars: base, pool: 80_000 }).needed,
			ceiling(80_000) + ceiling(80_000),
		);
		// The reservation of a run is the two numbers of its first step.
		const reservation = estimateRunMicroUsd(PLATFORM, { text: 'hello', historyChars: 0 });
		assert.equal(reservation, ceiling(0) + ceiling(20_000));
		// And the step itself is priced like a step.
		assert.equal(stepCeilingMicroUsd(PLATFORM, stepPromptChars(base)), ceiling(0));
	});

	it('the money never cuts a run after a tool call', async () => {
		// The model calls a tool on the first step, and the upstream reports
		// TWICE the estimate of that step: the money of the run is gone, and
		// the extension the loop asks for is refused.
		const base = promptCharCount({ text: 'hello', historyChars: 0 });
		// The tokens of the estimate of that step: the prompt of the step,
		// and the output a step may write.
		const promptTokens = Math.ceil(stepPromptChars(base) / 4);
		const completionTokens = config.maxOutputTokens;
		// The money of the day: the reservation of the run, and nothing more.
		// The extension the loop asks for is then refused.
		await setLeft(estimateRunMicroUsd(PLATFORM, { text: 'hello', historyChars: 0 }));
		mock.setOptions({
			toolCall: { name: 'read_page', arguments: { pageId: 'not-a-uuid' } },
			toolCallEveryStep: true,
			usageOnFirstStepOnly: true,
			usage: { promptTokens: 2 * promptTokens, completionTokens: 2 * completionTokens },
		});

		const calls = mock.calls;
		const conversationId = await createConversation();
		const runId = randomUUID();
		const events = await collect(
			new SseStream(await postRun(conversationId, runId, 'hello', PLATFORM.id)),
		);

		// The tool step ran: the model called the tool.
		assert.equal(mock.calls - calls, 2, 'the tool step ran, and the answer came after it');
		assert.equal(events.filter((event) => event.event === 'tool.called').length, 1);
		// The answer came from a step WITHOUT tools: the second request asked
		// for no tool.
		assert.equal(toolChoiceOf(mock.bodies[1]), 'none');
		// And the run ANSWERED: a text, and a `done`.
		assert.ok(textOf(events).length > 0, 'the run answers');
		assert.equal(events[events.length - 1]?.event, 'done');
		// The extension was refused: the run holds what it reserved up front,
		// and nothing more.
		const row = await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId]);
		assert.equal(
			Number(row.rows[0]?.reserved_microusd ?? 0),
			estimateRunMicroUsd(PLATFORM, { text: 'hello', historyChars: 0 }),
			'the run holds its first reservation, and no extension',
		);
		// The money of the day is still inside the cap.
		const ledger = await ledgerRow();
		assert.ok(
			(ledger?.spent ?? 0) + (ledger?.reserved ?? 0) <= USER_DAILY_MICROUSD,
			'the ledger is inside the cap of the day',
		);
		await setLeft(USER_DAILY_MICROUSD);
	});

	it('an extension that cannot write the row of the run gives the money back', async () => {
		// The money of the day, before the extension.
		const before = await ledgerRow();
		const target = {
			model: platformModel(METERED.id),
			modelId: METERED.id,
			connectionId: 'platform',
			pricing: METERED,
			platformBudget: true,
			wire: 'openai-compatible' as const,
			optionsKey: 'platform',
			reasoning: false,
		};

		// The row of the run cannot be written: the id of a run is a uuid,
		// and the statement that writes it fails on the way to the table.
		// The money of the day and the row of the run are ONE transaction,
		// so the money goes back with the statement that failed.
		await assert.rejects(
			() =>
				extendRunReservation(app.db, target, {
					userId: USER_A,
					day: today(),
					runId: 'not-a-uuid',
					amount: 100,
				}),
			/invalid input syntax for type uuid/,
		);
		assert.deepEqual(await ledgerRow(), before, 'the money of the user is unchanged');
	});
});
