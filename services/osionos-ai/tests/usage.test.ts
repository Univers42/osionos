import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, METERED, USER_A } from './harness.ts';
import { estimatedLogs, promptCharsOf, spentOf, textOf, usageOf, withLogs } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The spend of a run: what the ledger holds, what the upstream reported, and
 * the title of the conversation.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { costMicroUsd } = await import('../src/gateway/platform.ts');
const { reserve, settle } = await import('../src/budget.ts');

after(async () => {
	await app.close();
	await mock.close();
});

describe('osionos-ai spend and titles', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	});

	it('the cost of a call is the price of its tokens, rounded up', () => {
		const priced = { id: 'p', label: 'p', inputMicroUsdPerMTok: 1000, outputMicroUsdPerMTok: 2000, default: true };
		assert.equal(costMicroUsd(priced, { inputTokens: 1_000_000, outputTokens: 0 }), 1000);
		assert.equal(costMicroUsd(priced, { inputTokens: 0, outputTokens: 1_000_000 }), 2000);
		assert.equal(costMicroUsd(priced, { inputTokens: 1, outputTokens: 1 }), 1);
		assert.equal(costMicroUsd(priced, {}), 0);
	});

	it('the budget is reserved on the user and on the platform, and settled after', async () => {
		const day = '2026-01-01';
		const user = '33333333-3333-4333-8333-333333333333';

		assert.equal(await reserve(app.db, { userId: user, day, amount: 5, userLimit: 10, platformLimit: 10 }), true);
		const held = await app.db.query(
			'select subject, spent_microusd, reserved_microusd from public.ai_usage_daily where day = $1 order by subject',
			[day],
		);
		// The two subjects: the user and the platform.
		assert.equal(held.rowCount, 2);
		assert.deepEqual(
			held.rows.map((row) => row.subject),
			['33333333-3333-4333-8333-333333333333', 'platform'],
		);
		assert.equal(Number(held.rows[0].reserved_microusd), 5);

		// The user's budget is not enough any more: the call is refused.
		assert.equal(await reserve(app.db, { userId: user, day, amount: 6, userLimit: 10, platformLimit: 10 }), false);

		// The platform refuses: the user's reservation is not kept either.
		assert.equal(await reserve(app.db, { userId: user, day, amount: 1, userLimit: 100, platformLimit: 0 }), false);
		const afterRefusals = await app.db.query(
			'select subject, reserved_microusd from public.ai_usage_daily where day = $1 order by subject',
			[day],
		);
		assert.deepEqual(
			afterRefusals.rows.map((row) => Number(row.reserved_microusd)),
			[5, 5],
		);

		// The settlement: the reservation back, the real spend in.
		await settle(app.db, { userId: user, day, reserved: 5, actual: 3 });
		const settled = await app.db.query(
			'select subject, spent_microusd, reserved_microusd from public.ai_usage_daily where day = $1 order by subject',
			[day],
		);
		assert.deepEqual(
			settled.rows.map((row) => [row.subject, Number(row.spent_microusd), Number(row.reserved_microusd)]),
			[
				['33333333-3333-4333-8333-333333333333', 3, 0],
				['platform', 3, 0],
			],
		);
	});

	it('the ledger books the reservation, and never more than it', async () => {
		const day = '2026-02-02';
		const user = '44444444-4444-4444-8444-444444444444';

		assert.equal(await reserve(app.db, { userId: user, day, amount: 5, userLimit: 100, platformLimit: 100 }), true);

		// The run cost more than it reserved: the reservation is the ceiling of
		// the run, and the cap was checked against it. The ledger books the
		// ceiling, and the cost the upstream really charged stays in the row
		// of the run.
		await settle(app.db, { userId: user, day, reserved: 5, actual: 100 });
		const settled = await app.db.query(
			'select subject, spent_microusd, reserved_microusd from public.ai_usage_daily where day = $1 order by subject',
			[day],
		);
		assert.deepEqual(
			settled.rows.map((row) => [row.subject, Number(row.spent_microusd), Number(row.reserved_microusd)]),
			[
				['44444444-4444-4444-8444-444444444444', 5, 0],
				['platform', 5, 0],
			],
		);
	});

	it('the upstream is asked for the usage, and the spend is the real one', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		const before = await spentOf(app.db, USER_A);
		const platformBefore = await spentOf(app.db, 'platform');
		const events = await collect(new SseStream(await postRun(conversationId, runId, 'hello', 'mock-metered')));

		// The request asks for the usage: stream_options.include_usage.
		const body = mock.lastBody() as { stream_options?: { include_usage?: boolean } };
		assert.equal(body.stream_options?.include_usage, true);

		// The usage the upstream reported, and the price of it.
		const usage = usageOf(events);
		assert.equal(usage.inputTokens, 11);
		assert.equal(usage.outputTokens, 7);
		assert.equal(usage.costMicroUsd, costMicroUsd(METERED, { inputTokens: 11, outputTokens: 7 }));

		// The ledger moves by exactly that: the daily cap can trip.
		const spent = (await spentOf(app.db, USER_A)) - before;
		assert.equal(spent, costMicroUsd(METERED, { inputTokens: 11, outputTokens: 7 }));
		assert.ok(spent > 0);
		// The platform pays the same price.
		assert.equal((await spentOf(app.db, 'platform')) - platformBefore, spent);
	});

	it('an upstream that reports no usage still costs the estimate', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		const before = await spentOf(app.db, USER_A);
		mock.setOptions({ neverSendUsage: true });
		let events: SseEvent[] = [];
		let logs: string[] = [];
		try {
			const captured = await withLogs(async () => {
				events = await collect(new SseStream(await postRun(conversationId, runId, 'hello', 'mock-metered')));
			});
			logs = captured.logs;
		} finally {
			mock.setOptions({ neverSendUsage: false });
		}

		// The estimate: the characters of the prompt and of the answer, a token
		// every four characters.
		const promptChars = promptCharsOf(mock.lastBody());
		const answerChars = textOf(events).length;
		const estimated = {
			inputTokens: Math.ceil(promptChars / 4),
			outputTokens: Math.ceil(answerChars / 4),
		};
		const usage = usageOf(events);
		assert.equal(usage.inputTokens, estimated.inputTokens);
		assert.equal(usage.outputTokens, estimated.outputTokens);

		// The spend is the estimate, and it is not zero.
		const spent = (await spentOf(app.db, USER_A)) - before;
		assert.ok(spent > 0);
		assert.equal(spent, costMicroUsd(METERED, estimated));
		// The estimate is not the price of the real usage: the two differ.
		assert.notEqual(spent, costMicroUsd(METERED, { inputTokens: 11, outputTokens: 7 }));

		// One line says the usage was estimated.
		assert.deepEqual(estimatedLogs(logs), [runId]);
	});

	it('the first run names the conversation after its question', async () => {
		const question = '  How do I  wire the budget of a run\nto the usage the upstream reports?  ';
		const conversationId = await createConversation('');
		const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), question)));

		// The title is the question, on one line, cut at a word boundary.
		const started = events[0];
		assert.equal(started?.event, 'run.started');
		const title = (started?.data as { conversationTitle: string }).conversationTitle;
		assert.equal(title, 'How do I wire the budget of a run to the usage the upstream…');

		const stored = await app.db.query('select title from public.ai_conversations where id = $1', [conversationId]);
		assert.equal(stored.rows[0].title, title);
	});

	it('the default title of the app is replaced by the first question', async () => {
		const conversationId = await createConversation('New conversation');
		const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'what is the budget?')));
		const title = (events[0]?.data as { conversationTitle: string }).conversationTitle;
		assert.equal(title, 'what is the budget?');
	});

	it('the second run keeps the title of the conversation', async () => {
		const conversationId = await createConversation('');
		const first = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'the first question')));
		const title = (first[0]?.data as { conversationTitle: string }).conversationTitle;
		assert.equal(title, 'the first question');

		const second = await collect(
			new SseStream(await postRun(conversationId, randomUUID(), 'and a completely different one')),
		);
		assert.equal((second[0]?.data as { conversationTitle: string }).conversationTitle, title);
		const stored = await app.db.query('select title from public.ai_conversations where id = $1', [conversationId]);
		assert.equal(stored.rows[0].title, title);
	});

	it('a title the user set is kept', async () => {
		const conversationId = await createConversation('Quarterly plan');
		const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'a question')));
		assert.equal((events[0]?.data as { conversationTitle: string }).conversationTitle, 'Quarterly plan');
		const stored = await app.db.query('select title from public.ai_conversations where id = $1', [conversationId]);
		assert.equal(stored.rows[0].title, 'Quarterly plan');
	});
});
