import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import type { JsonBody } from './harness.ts';
import { textOf } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The runs: the stream of the events, the replay, the refusals, the pages of
 * the prompt, and the sweep of the stale ones.
 */
const { app, base, mock, call, postRun, tokenFor, createConversation } = await startHarness();
const { sweepStaleRuns } = await import('../src/runs/runner.ts');

after(async () => {
	await app.close();
	await mock.close();
});

describe('osionos-ai runs', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	});

	it('a run streams its events and keeps the answer', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		const events = await collect(new SseStream(await postRun(conversationId, runId, 'hello')));

		assert.equal(events[0]?.event, 'run.started');
		assert.ok(events.some((event) => event.event === 'text.delta'));
		assert.ok(events.some((event) => event.event === 'usage'));
		assert.equal(events[events.length - 1]?.event, 'done');
		assert.equal(textOf(events), mock.texts[mock.texts.length - 1]);

		const stored = await app.db.query(
			'select role, parts, model, run_id, usage from public.ai_messages where conversation_id = $1 and role = $2',
			[conversationId, 'assistant'],
		);
		assert.equal(stored.rowCount, 1);
		const parts = stored.rows[0].parts as { type: string; text: string }[];
		assert.equal(parts[0]?.text, mock.texts[mock.texts.length - 1]);
		assert.equal(stored.rows[0].model, 'mock-model');
		assert.equal(stored.rows[0].run_id, runId);
		const usage = stored.rows[0].usage as { inputTokens: number; outputTokens: number };
		assert.equal(usage.inputTokens, 11);
		assert.equal(usage.outputTokens, 7);
	});

	it('the same run asked again replays the stream and calls no model', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		const first = await collect(new SseStream(await postRun(conversationId, runId, 'hello again')));
		const calls = mock.calls;

		const second = await collect(new SseStream(await postRun(conversationId, runId, 'hello again')));
		assert.deepEqual(
			second.map((event) => event.event),
			first.map((event) => event.event),
		);
		assert.deepEqual(
			second.map((event) => event.data),
			first.map((event) => event.data),
		);
		assert.equal(mock.calls, calls);
	});

	it('the events and the cancel of a foreign run are a 404', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		await collect(new SseStream(await postRun(conversationId, runId, 'mine')));

		const events = await call(`/api/ai/runs/${runId}/events`, { token: tokenFor(USER_B, WORKSPACE_B) });
		assert.equal(events.status, 404);
		assert.equal(events.body?.code, 'not_found');

		const cancel = await call(`/api/ai/runs/${runId}/cancel`, {
			method: 'POST',
			token: tokenFor(USER_B, WORKSPACE_B),
		});
		assert.equal(cancel.status, 404);
	});

	it('a client that comes back gets the rest of the run, once', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		mock.setOptions({ preDelayMs: 0, chunkCount: 6, chunkGapMs: 30, fail: false });

		const stream = new SseStream(await postRun(conversationId, runId, 'resume me'));
		const first: SseEvent[] = [];
		while (first.length < 3) {
			const event = await stream.next();
			assert.ok(event);
			first.push(event);
		}
		await stream.drop();

		const answer = await fetch(`${base}/api/ai/runs/${runId}/events`, {
			headers: {
				authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`,
				'last-event-id': first[2].id,
			},
		});
		const rest = await collect(new SseStream(answer));
		const events = [...first, ...rest];
		assert.equal(textOf(events), mock.texts[mock.texts.length - 1]);
		assert.equal(events.filter((event) => event.event === 'done').length, 1);
		assert.equal(events[events.length - 1].event, 'done');
	});

	it('a second run on the same conversation is refused', async () => {
		const conversationId = await createConversation();
		mock.setOptions({ preDelayMs: 400, chunkCount: 4, chunkGapMs: 10, fail: false });
		const first = await postRun(conversationId, randomUUID(), 'first');

		const second = await postRun(conversationId, randomUUID(), 'second');
		assert.equal(second.status, 409);
		const body = (await second.json()) as JsonBody;
		assert.equal(body.code, 'run_in_progress');

		await collect(new SseStream(first));
	});

	it('a run without money is refused before the model is called', async () => {
		const conversationId = await createConversation();
		const calls = mock.calls;
		const response = await postRun(conversationId, randomUUID(), 'too expensive', 'mock-dear');
		assert.equal(response.status, 402);
		const body = (await response.json()) as JsonBody;
		assert.equal(body.code, 'budget_exhausted');
		assert.equal(mock.calls, calls);

		const run = await app.db.query('select status, error from public.ai_runs where conversation_id = $1', [
			conversationId,
		]);
		assert.equal(run.rows[0].status, 'failed');
		assert.equal(run.rows[0].error, 'budget_exhausted');
	});

	it('a cancelled run stops with a cancelled error', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		mock.setOptions({ preDelayMs: 0, chunkCount: 30, chunkGapMs: 40, fail: false });

		const stream = new SseStream(await postRun(conversationId, runId, 'stop me'));
		const events: SseEvent[] = [];
		while (!events.some((event) => event.event === 'text.delta')) {
			const event = await stream.next();
			assert.ok(event);
			events.push(event);
		}

		const cancelled = await call(`/api/ai/runs/${runId}/cancel`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(cancelled.status, 202);

		while (!events.some((event) => event.event === 'error' || event.event === 'done')) {
			const event = await stream.next();
			assert.ok(event);
			events.push(event);
		}
		const last = events[events.length - 1];
		assert.equal(last.event, 'error');
		assert.equal((last.data as { code: string }).code, 'cancelled');

		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.equal(run.rows[0].status, 'cancelled');
	});

	it('a model that is not on the allowlist is refused', async () => {
		const conversationId = await createConversation();
		const response = await postRun(conversationId, randomUUID(), 'hello', 'no-such-model');
		assert.equal(response.status, 400);
		const body = (await response.json()) as JsonBody;
		assert.equal(body.code, 'model_not_allowed');
	});

	it('a run quotes the pages the caller may read, and skips the others', async () => {
		const shared = randomUUID();
		const foreign = randomUUID();
		const missing = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
			 values ($1, $2, $3, 'Shared notes', 'shared', $4::jsonb),
			        ($5, $6, $7, 'Private notes', 'private', $8::jsonb)`,
			[
				shared,
				WORKSPACE_A,
				USER_A,
				JSON.stringify([{ content: 'the readable page text' }]),
				foreign,
				WORKSPACE_B,
				USER_B,
				JSON.stringify([{ content: 'the private page text' }]),
			],
		);

		const conversationId = await createConversation();
		const events = await collect(
			new SseStream(
				await postRun(conversationId, randomUUID(), 'what do the notes say?', undefined, undefined, [
					shared,
					foreign,
					missing,
				]),
			),
		);

		// The prompt carries the page the caller may read, and only that one.
		const prompt = JSON.stringify(mock.lastBody());
		assert.ok(prompt.includes('the readable page text'));
		assert.ok(!prompt.includes('the private page text'));

		// The pages that are not readable are skipped, never refused.
		const started = events[0];
		assert.equal(started?.event, 'run.started');
		const skipped = (started?.data as { skippedPageIds: string[] }).skippedPageIds;
		assert.deepEqual(skipped, [foreign, missing]);
		assert.equal(events[events.length - 1]?.event, 'done');
	});

	it('the sweep gives up a stale run and gives its money back', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		await app.db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model, reserved_microusd, created_at)
			 values ($1, $2, $3, 'running', $4, 5, now() - interval '11 minutes')`,
			[runId, conversationId, USER_A, 'mock-model'],
		);
		await app.db.query(
			`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
			 values ($1, current_date, 0, 5)
			 on conflict (subject, day) do update set reserved_microusd = 5`,
			[USER_A],
		);

		const swept = await sweepStaleRuns(app.db);
		assert.deepEqual(swept, [runId]);

		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.equal(run.rows[0].status, 'failed');
		assert.equal(run.rows[0].error, 'timeout');

		const usage = await app.db.query(
			'select reserved_microusd, spent_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
			[USER_A],
		);
		assert.equal(Number(usage.rows[0].reserved_microusd), 0);
	});

	it('the models of the platform never carry a price', async () => {
		const answer = await call('/api/ai/models', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 200);
		const models = answer.body?.models as { id: string; label: string; default: boolean }[];
		assert.equal(models.length, 4);
		assert.equal(models.filter((model) => model.default).length, 1);
		assert.deepEqual(Object.keys(models[0]).sort(), ['default', 'id', 'label']);
	});
});
