import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startKit, lastOf } from './failoverKit.ts';
import { SseStream, collect } from './sse.ts';

/**
 * A provider failure through the real SDK, end to end: the scripted upstream
 * answers, and the last frame and the row of the run are read.
 *
 * The bodies are UNVERIFIED fixtures of the OpenRouter shape, not captures.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, runRow, clean, post, createConversation } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

/** Not a plain word: the row keeps a provider's `error_type` only when it is one. */
const CANARY = 'sk-or-v1 CANARY acme@example.com';
const providerBody = (message: string, errorType?: string) =>
	JSON.stringify({ error: { code: 400, message, metadata: { provider_name: CANARY, raw: CANARY, ...(errorType ? { error_type: errorType } : {}) } } });
const lastData = (events: { event: string; data: unknown }[]) => lastOf(events as never).data as Record<string, unknown>;

/** One attempt: a chain of one retries, and the SDK sleeps through a Retry-After. */
const oneAttempt = (answer: Parameters<typeof failing.script>[1]) => {
	failing.script('mock-metered', answer);
	failing.script('mock-vision', answer);
	return { model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] };
};

describe('the frame and the row of a failed run', () => {
	before(clean);
	beforeEach(clean);

	it('a 429 sends its seconds, and the row keeps the status and the type', async () => {
		const body = oneAttempt({ behaviour: 429, retryAfter: '7', body: providerBody('busy', 'provider_overloaded') });
		const { runId, events } = await runToEnd(body);
		assert.deepEqual(lastData(events), { code: 'rate_limited', retryAfterSeconds: 7 });
		assert.equal((await runRow(runId)).error, 'rate_limited:429:provider_overloaded');
	});

	it('a 402 is the quota, and does not move the run', async () => {
		failing.script('mock-metered', { behaviour: 402, body: providerBody('Insufficient credits') });
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.deepEqual(lastData(events), { code: 'quota_exhausted' });
		assert.equal((await runRow(runId)).error, 'quota_exhausted:402');
		assert.deepEqual(failing.requests, ['mock-metered']);
	});

	it('the daily cap of a 429 is the quota', async () => {
		const body = oneAttempt({ behaviour: 429, body: providerBody('Rate limit exceeded: free-models-per-day') });
		assert.deepEqual(lastData((await runToEnd(body)).events), { code: 'quota_exhausted' });
	});

	it('a 5xx after a move is the provider, and the row of attempts keeps the bare code', async () => {
		const { runId, events } = await runToEnd(oneAttempt(503));
		assert.deepEqual(lastData(events), { code: 'provider_unavailable' });
		const row = await runRow(runId);
		assert.equal(row.error, 'provider_unavailable:503');
		assert.equal(row.usage?.attempts?.at(-1)?.outcome, 'provider_unavailable');
	});

	it('a 400 over the context window says so', async () => {
		failing.script('mock-metered', { behaviour: 400, body: providerBody("This model's maximum context length is 8192 tokens") });
		const { runId, events } = await runToEnd({ model: 'mock-metered' });
		assert.deepEqual(lastData(events), { code: 'context_too_long' });
		assert.equal((await runRow(runId)).error, 'context_too_long:400');
	});

	it('any other failure stays upstream_error', async () => {
		failing.script('mock-metered', { behaviour: 400, body: providerBody('bad tool schema') });
		const { runId, events } = await runToEnd({ model: 'mock-metered' });
		assert.deepEqual(lastData(events), { code: 'upstream_error' });
		assert.equal((await runRow(runId)).error, 'upstream_error:400');
	});

	it('an error inside a 200 stream takes the class of its code', async () => {
		failing.script('mock-metered', { behaviour: 'stream_error', body: JSON.stringify({ error: { message: CANARY, code: 503 } }) });
		const { runId, events } = await runToEnd({ model: 'mock-metered' });
		assert.deepEqual(lastData(events), { code: 'provider_unavailable' });
		assert.equal((await runRow(runId)).error, 'provider_unavailable:503');
	});

	it('the re-POST of a run an upstream 429 failed re-attaches: it is not the preflight refusal', async () => {
		const runId = randomUUID();
		const conversationId = await createConversation();
		const request = { runId, conversationId, text: 'hello', ...oneAttempt(429) };
		await collect(new SseStream(await post(request)));
		const again = await post(request);
		assert.equal(again.status, 200);
		assert.deepEqual(lastData(await collect(new SseStream(again))), { code: 'rate_limited' });
	});

	it('a failure of ours after a good move does not take the class of the replaced attempt', async () => {
		await app.db.query(`create function public.test_refuse_answer() returns trigger language plpgsql as $$ begin raise exception 'refused'; end $$`);
		await app.db.query(`create trigger test_refuse_answer before insert on public.ai_messages for each row when (new.role = 'assistant') execute function public.test_refuse_answer()`);
		try {
			failing.script('mock-metered', 429);
			const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
			assert.deepEqual(lastData(events), { code: 'upstream_error' });
			assert.equal((await runRow(runId)).error, 'upstream_error');
		} finally {
			await app.db.query('drop trigger test_refuse_answer on public.ai_messages');
			await app.db.query('drop function public.test_refuse_answer');
		}
	});
});
