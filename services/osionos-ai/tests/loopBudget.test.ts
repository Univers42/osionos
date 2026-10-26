import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, METERED, PLATFORM, USER_A, USER_DAILY_MICROUSD } from './harness.ts';
import { spentOf, textOf } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The money of a run: what it reserves, and what it spends.
 *
 * The reservation of a run is NOT the cost of the whole loop: the run holds
 * the first step and the answer that follows it up front, and the steps
 * after that ask the ledger for what they need, one extension at a time.
 *
 * And the step that is going to be the last one of the loop runs WITHOUT
 * tools: the model answers with what it has. A run that ends with a tool
 * call gives the user nothing.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { estimateRunMicroUsd, promptCharCount, stepCeilingMicroUsd, stepPromptChars } = await import(
	'../src/runs/estimate.ts'
);
const { costMicroUsd } = await import('../src/gateway/platform.ts');
const { MAX_STEPS, TOOL_OUTPUT_CHARS } = await import('../src/tools/index.ts');

after(async () => {
	await app.close();
	await mock.close();
});

/**
 * The reservation of a run on the metered model: the first step, and the
 * answer that follows it.
 */
const RESERVATION = estimateRunMicroUsd(METERED, { text: 'hello', historyChars: 0 });

/**
 * What the mock reports for a step: 100 prompt tokens on the metered model.
 *
 * The mock of the tests below reports that usage, so the money of the day
 * moves by this much on every step.
 */
const STEP = costMicroUsd(METERED, { inputTokens: 100, outputTokens: 0 });

/** The money the user has left today, in micro-USD. */
async function setLeft(left: number): Promise<void> {
	await app.db.query(
		`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
		 values ($1, current_date, $2, 0)
		 on conflict (subject, day) do update set spent_microusd = $2, reserved_microusd = 0`,
		[USER_A, USER_DAILY_MICROUSD - left],
	);
}

/** What the ledger holds for the user today. */
async function ledgerOf(): Promise<{ spent: number; reserved: number }> {
	const result = await app.db.query(
		'select spent_microusd, reserved_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
		[USER_A],
	);
	return {
		spent: Number(result.rows[0]?.spent_microusd ?? 0),
		reserved: Number(result.rows[0]?.reserved_microusd ?? 0),
	};
}

/** The events of a type. */
function eventsOf(events: SseEvent[], type: string): SseEvent[] {
	return events.filter((event) => event.event === type);
}

/** The tool choice the service asked for, in a body of the mock. */
function toolChoiceOf(body: unknown): string | undefined {
	return (body as { tool_choice?: string } | null)?.tool_choice;
}

describe('the money of a run', () => {
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
		});
	});

	it('a hello on a platform model is not refused, and the run reserves its first step and its answer', async () => {
		// The price of a real model: the reservation of a five-step loop used
		// to cost more than the whole cap of the day, and every run was
		// refused before it started.
		const runId = randomUUID();
		const conversationId = await createConversation();
		const response = await postRun(conversationId, runId, 'hello', PLATFORM.id);
		assert.equal(response.status, 200);
		const events = await collect(new SseStream(response));
		assert.equal(events[events.length - 1]?.event, 'done');

		// The reservation of the run: the first step, and the answer that
		// follows it. The answer reads what the tools of the first step add
		// (one step's share), so its prompt is bigger than the first one's.
		// The row of the run carries the number the ledger was asked to
		// reserve.
		const row = await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId]);
		const reserved = Number(row.rows[0]?.reserved_microusd ?? 0);
		const base = promptCharCount({ text: 'hello', historyChars: 0 });
		const step = stepCeilingMicroUsd(PLATFORM, stepPromptChars(base));
		const answer = stepCeilingMicroUsd(PLATFORM, stepPromptChars(base, TOOL_OUTPUT_CHARS));
		assert.equal(reserved, step + answer);
		// And the cap of the day held it: the run was not refused.
		assert.ok(reserved < USER_DAILY_MICROUSD, `the reservation fits in the cap: ${reserved}`);
	});

	it('the loop stops itself when the money of the day is gone, and the run still answers', async () => {
		// The model calls a tool on every step: the money of the day runs out
		// after the second step, and the third one answers. A run that ends
		// with a tool call gives the user nothing.
		//
		// The money of the day: the reservation of the run, and the ONE
		// extension the loop asks for. The extension is what the step the
		// mock reports costs.
		await setLeft(RESERVATION + STEP);
		mock.setOptions({
			toolCall: { name: 'read_page', arguments: { pageId: 'not-a-uuid' } },
			toolCallEveryStep: true,
			usage: { promptTokens: 100, completionTokens: 0 },
		});

		const before = await spentOf(app.db, USER_A);
		const calls = mock.calls;
		const conversationId = await createConversation();
		const events = await collect(
			new SseStream(await postRun(conversationId, randomUUID(), 'hello', METERED.id)),
		);

		// The run ends normally: a `done`, never an error.
		assert.equal(events[events.length - 1]?.event, 'done');
		// The loop stopped itself: it did not spend its five steps.
		const steps = mock.calls - calls;
		assert.ok(steps >= 2 && steps <= 3, `the loop stopped itself: ${steps} steps`);
		// The run ANSWERED: the last step ran without tools.
		assert.ok(textOf(events).length > 0, 'the run answers');
		assert.equal(toolChoiceOf(mock.lastBody()), 'none');
		// The spend of the run stays inside the money of the day.
		const spent = (await spentOf(app.db, USER_A)) - before;
		assert.ok(spent > 0, 'the run was paid for');
		assert.ok(spent <= RESERVATION + STEP, `the spend is inside the money of the day: ${spent}`);
		await setLeft(USER_DAILY_MICROUSD);
	});

	it('the last step of the loop answers, even when the model wants a tool', async () => {
		// The model calls a tool on every step and the money is free: the
		// loop runs to its cap, and the last step runs WITHOUT tools, so the
		// run ends with an answer.
		mock.setOptions({
			toolCall: { name: 'read_page', arguments: { pageId: 'not-a-uuid' } },
			toolCallEveryStep: true,
		});
		const calls = mock.calls;
		const conversationId = await createConversation();
		const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'hello')));

		// The loop ran to its cap.
		assert.equal(mock.calls - calls, MAX_STEPS);
		// The last step asked for no tool, and the run answered.
		assert.equal(toolChoiceOf(mock.lastBody()), 'none');
		assert.ok(textOf(events).length > 0, 'the run answers');
		assert.equal(events[events.length - 1]?.event, 'done');
	});

	it('a loop that wants five steps stops at the three the money of the day allows', async () => {
		// The money of the day allows the first step, one extension, and the
		// answer: the loop stops at the third step, and that step answers.
		//
		// A step here reports 2 000 prompt tokens (40 micro-USD), not 100: at
		// 100 a step cost 2 micro-USD, the size of the rounding of a ceiling,
		// so whether a fourth step fit depended on where the tool definitions
		// put the ceilings (suggest_agent's 495 characters let it fit). Half a
		// step of slack covers what the tool output adds to the ceilings and
		// stays under the step a fourth call would need; the step stays under
		// the ceiling of a step, so the settlement stays inside the cap.
		const wideStep = costMicroUsd(METERED, { inputTokens: 2_000, outputTokens: 0 });
		assert.ok(wideStep < RESERVATION / 2, 'a reported step stays under the ceiling of a step');
		await setLeft(RESERVATION + wideStep + wideStep / 2);
		mock.setOptions({
			toolCall: { name: 'read_page', arguments: { pageId: 'not-a-uuid' } },
			toolCallEveryStep: true,
			usage: { promptTokens: 2_000, completionTokens: 0 },
		});
		const calls = mock.calls;
		const conversationId = await createConversation();
		const events = await collect(
			new SseStream(await postRun(conversationId, randomUUID(), 'hello', METERED.id)),
		);

		// Three steps: the first two call the tool, the third answers.
		assert.equal(mock.calls - calls, 3);
		const bodies = mock.bodies.slice(calls);
		assert.equal(toolChoiceOf(bodies[0]), 'auto');
		assert.equal(toolChoiceOf(bodies[1]), 'auto');
		assert.equal(toolChoiceOf(bodies[2]), 'none');
		// The run answers and ends.
		assert.ok(textOf(events).length > 0, 'the run answers');
		assert.equal(events[events.length - 1]?.event, 'done');
		// The ledger is inside the cap of the day.
		const ledger = await ledgerOf();
		assert.ok(ledger.spent + ledger.reserved <= USER_DAILY_MICROUSD, 'the ledger is inside the cap');
		await setLeft(USER_DAILY_MICROUSD);
	});

	it('two runs of one user never go over the cap of the day', async () => {
		// Two runs of one user, and the money of the day is almost gone: the
		// extension of one of them is refused, and that one answers without
		// tools. The ledger never goes over the cap.
		//
		// The money of the day: the reservation of TWO runs, and the one
		// extension the loop asks for.
		await setLeft(2 * RESERVATION + STEP);
		mock.setOptions({
			// The first step of the two runs waits: both reservations are
			// held before either of them asks for an extension.
			preDelayMs: 50,
			toolCall: { name: 'read_page', arguments: { pageId: 'not-a-uuid' } },
			toolCallEveryStep: true,
			usage: { promptTokens: 100, completionTokens: 0 },
		});
		const first = await createConversation();
		const second = await createConversation();
		const [one, two] = await Promise.all([
			postRun(first, randomUUID(), 'hello', METERED.id),
			postRun(second, randomUUID(), 'hello', METERED.id),
		]);
		// Both runs started: the money of the day held the two reservations.
		assert.equal(one.status, 200);
		assert.equal(two.status, 200);
		// The ledger is inside the cap while the runs are going.
		const during = await ledgerOf();
		assert.ok(during.spent + during.reserved <= USER_DAILY_MICROUSD, 'the ledger is inside the cap');

		const [eventsOne, eventsTwo] = await Promise.all([
			collect(new SseStream(one)),
			collect(new SseStream(two)),
		]);
		// Both runs answered and ended.
		assert.equal(eventsOne[eventsOne.length - 1]?.event, 'done');
		assert.equal(eventsTwo[eventsTwo.length - 1]?.event, 'done');
		assert.ok(textOf(eventsOne).length > 0, 'the first run answers');
		assert.ok(textOf(eventsTwo).length > 0, 'the second run answers');
		// One of the two was cut short: the extension it asked for was
		// refused, and it answered without tools.
		const toolCalls = [eventsOf(eventsOne, 'tool.called').length, eventsOf(eventsTwo, 'tool.called').length];
		assert.ok(
			Math.min(...toolCalls) < MAX_STEPS - 1,
			`one of the runs was cut short: ${toolCalls.join(' and ')} tool calls`,
		);
		// The ledger is inside the cap when the runs are done.
		const after = await ledgerOf();
		assert.ok(after.spent + after.reserved <= USER_DAILY_MICROUSD, 'the ledger is inside the cap');
		mock.setOptions({ preDelayMs: 0 });
		await setLeft(USER_DAILY_MICROUSD);
	});
});
