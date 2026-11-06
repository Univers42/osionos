import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { FREE_TIER_FIRST, FREE_TIER_SECOND, USER_A, WORKSPACE_A } from './harness.ts';
import { startKit, lastOf } from './failoverKit.ts';
import type { Scripted } from './mockFailing.ts';

/**
 * The free quota of the platform through the real SDK: every question spends a
 * bounded number of calls, and a closed quota is not probed by every route.
 *
 * The bodies and the headers are UNVERIFIED fixtures: OpenRouter's documented
 * platform limit, and the upstream shape of public logs. No live capture.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, runRow, clean, post, call, tokenFor, createConversation } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

const FIRST = FREE_TIER_FIRST.id;
const SECOND = FREE_TIER_SECOND.id;
const OURS = 'mock-model';
const ACCOUNT_KEY = 'ai:cooldown:account:platform';

const accountLimit = (retryAfter = '7'): Scripted => ({
	behaviour: 429,
	retryAfter,
	headers: { 'x-ratelimit-limit': '20', 'x-ratelimit-remaining': '0' },
	body: JSON.stringify({ error: { code: 429, message: 'Rate limit exceeded', metadata: { error_type: 'rate_limit_exceeded' } } }),
});
const providerLimit: Scripted = {
	behaviour: 429,
	body: JSON.stringify({ error: { code: 429, message: 'Provider returned error', metadata: { provider_name: 'Upstream', raw: 'busy' } } }),
};
const ambiguousLimit: Scripted = { behaviour: 429 };

const lastData = (events: { event: string; data: unknown }[]) => lastOf(events as never).data as Record<string, unknown>;
const accountRests = async () => (await app.redis.exists(ACCOUNT_KEY)) === 1;
const closeQuota = () => app.redis.set(ACCOUNT_KEY, String(Date.now() + 30_000), 'EX', 30);

describe('the calls of one question', () => {
	it('a route that keeps failing costs far less than the SDK retries did (15 before)', async () => {
		const steps = Array.from({ length: 4 }, () => [503, 503, 'tool'] as const).flat();
		failing.script(OURS, ...steps, 503, 503, 503);
		await runToEnd({ model: OURS });
		assert.ok(failing.requests.length <= 6, `${failing.requests.length} calls`);
	});

	it('a chain of three spends at most 7 calls: two failed routes and five steps', async () => {
		failing.script(FIRST, 503);
		failing.script(SECOND, 503);
		failing.script(OURS, 'tool', 'tool', 'tool', 'tool', 'ok');
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }, { model: OURS }] });
		assert.equal(lastOf(events).event, 'done');
		assert.equal(failing.requests.length, 7);
	});

	it('/complete never retries (3 before)', async () => {
		failing.always(FIRST, 503);
		const answer = await fetch(`${kit.base}/api/ai/complete`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), command: 'summarize', input: { text: 'hello' }, model: FIRST }),
		});
		await answer.text();
		assert.equal(answer.status, 200);
		assert.equal(failing.countFor(FIRST), 1);
	});
});

describe('a limit of the account', () => {
	it('zero further calls, every free route rests, and the frame says when', async () => {
		failing.script(FIRST, accountLimit());
		const { runId, events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }] });
		assert.deepEqual(failing.requests, [FIRST]);
		assert.deepEqual(lastData(events), { code: 'rate_limited', retryAfterSeconds: 7 });
		assert.equal((await runRow(runId)).error, 'rate_limited:429:rate_limit_exceeded');
		assert.equal(await accountRests(), true);
	});

	it('the run still moves to a route off the shared quota, past the free ones', async () => {
		failing.script(FIRST, accountLimit());
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }, { model: OURS }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, [FIRST, OURS]);
	});

	it('the next question is refused before a call, with its seconds, and its transcript stays', async () => {
		const conversationId = await createConversation();
		const firstRun = randomUUID();
		const answered = await post({ runId: firstRun, conversationId, text: 'first', model: FIRST });
		await answered.text();
		failing.reset();
		await closeQuota();

		const retry = await post({ runId: randomUUID(), conversationId, text: 'first', model: FIRST, replaceFromRunId: firstRun });
		assert.equal(retry.status, 429);
		assert.ok(Number(retry.headers.get('retry-after')) > 0);
		assert.equal(failing.requests.length, 0);
		const kept = await app.db.query('select count(*)::int as n from public.ai_messages where conversation_id = $1', [conversationId]);
		assert.equal(kept.rows[0].n, 2);
	});

	it('the re-POST of a refused run answers the same, with the seconds', async () => {
		await closeQuota();
		const runId = randomUUID();
		const conversationId = await createConversation();
		const body = { runId, conversationId, text: 'hello', model: FIRST };
		await (await post(body)).text();
		const again = await post(body);
		assert.equal(again.status, 429);
		assert.ok(Number(again.headers.get('retry-after')) > 0);
	});

	it('/complete is refused with its seconds while the account rests', async () => {
		await closeQuota();
		const answer = await fetch(`${kit.base}/api/ai/complete`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), command: 'summarize', input: { text: 'hello' }, model: FIRST }),
		});
		await answer.text();
		assert.equal(answer.status, 429);
		assert.ok(Number(answer.headers.get('retry-after')) > 0);
		assert.equal(failing.requests.length, 0);
	});

	it('/complete closes the quota for the runs that follow', async () => {
		failing.script(FIRST, accountLimit());
		const answer = await fetch(`${kit.base}/api/ai/complete`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), command: 'summarize', input: { text: 'hello' }, model: FIRST }),
		});
		await answer.text();
		assert.equal(await accountRests(), true);
	});

	it('the models say the free routes rest, and only them', async () => {
		await closeQuota();
		const list = await call('/api/ai/models', { token: tokenFor(USER_A, WORKSPACE_A) });
		const models = (list.body?.models ?? []) as { id: string; cooldownUntil?: string }[];
		assert.ok(models.find((model) => model.id === FIRST)?.cooldownUntil);
		assert.equal(models.find((model) => model.id === OURS)?.cooldownUntil, undefined);
	});
});

describe('a failure of the provider', () => {
	it('a 503 moves to exactly one fallback and rests that route alone', async () => {
		failing.script(FIRST, 503);
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }, { model: OURS }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, [FIRST, SECOND]);
		assert.equal(await accountRests(), false);
	});

	it('a 429 of a named provider moves on too', async () => {
		failing.script(FIRST, providerLimit);
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, [FIRST, SECOND]);
		assert.equal(await accountRests(), false);
	});

	it('a 429 that says neither stops the free walk, and rests no account', async () => {
		failing.script(FIRST, ambiguousLimit);
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }] });
		assert.deepEqual(failing.requests, [FIRST]);
		assert.equal(lastData(events).code, 'rate_limited');
		assert.equal(await accountRests(), false);
	});
});

describe('the one retry of a run with no other route', () => {
	it('a 503 is called again, after a pause', async () => {
		failing.script(OURS, 503, 'ok');
		const started = Date.now();
		const { runId, events } = await runToEnd({ model: OURS });
		assert.equal(lastOf(events).event, 'done');
		assert.equal(failing.countFor(OURS), 2);
		assert.ok(Date.now() - started >= 1000, 'the backoff waited');
		assert.deepEqual((await runRow(runId)).usage?.attempts?.map((attempt) => attempt.outcome), ['retried', 'succeeded']);
	});

	it('a socket that dies is called again', async () => {
		failing.script(OURS, 'reset', 'ok');
		const { events } = await runToEnd({ model: OURS });
		assert.equal(lastOf(events).event, 'done');
		assert.equal(failing.countFor(OURS), 2);
	});

	it('only once', async () => {
		failing.always(OURS, 503);
		const { events } = await runToEnd({ model: OURS });
		assert.equal(lastData(events).code, 'provider_unavailable');
		assert.equal(failing.countFor(OURS), 2);
	});

	it('the worst case of a run with no chain is 6 calls', async () => {
		failing.script(OURS, 503, 'tool', 'tool', 'tool', 'tool', 'ok');
		const { events } = await runToEnd({ model: OURS });
		assert.equal(lastOf(events).event, 'done');
		assert.equal(failing.countFor(OURS), 6);
	});

	it('not a 429', async () => {
		failing.script(OURS, providerLimit, 'ok');
		await runToEnd({ model: OURS });
		assert.equal(failing.countFor(OURS), 1);
	});

	it('not while the account rests', async () => {
		await closeQuota();
		failing.script(OURS, 503, 'ok');
		await runToEnd({ model: OURS });
		assert.equal(failing.countFor(OURS), 1);
	});

	it('not after the run showed something: a tool would run twice', async () => {
		failing.script(OURS, 'tool', 503, 'ok');
		await runToEnd({ model: OURS });
		assert.equal(failing.countFor(OURS), 2);
	});

	it('not at the end of a chain: the chain was the retry', async () => {
		failing.script(FIRST, 503);
		failing.script(SECOND, 503, 'ok');
		const { events } = await runToEnd({ model: FIRST, fallbacks: [{ model: SECOND }] });
		assert.equal(lastData(events).code, 'provider_unavailable');
		assert.deepEqual(failing.requests, [FIRST, SECOND]);
	});
});

describe('two runs at once', () => {
	it('the rest one run wrote stops the walk of the other', async () => {
		failing.script(FIRST, accountLimit());
		failing.script('mock-metered', { behaviour: 503, delayMs: 300 });
		const [closing, walking] = await Promise.all([
			runToEnd({ model: FIRST }),
			runToEnd({ model: 'mock-metered', fallbacks: [{ model: SECOND }] }),
		]);
		assert.equal(lastData(closing.events).code, 'rate_limited');
		assert.equal(lastOf(walking.events).event, 'error');
		assert.equal(failing.countFor(SECOND), 0);
	});
});
