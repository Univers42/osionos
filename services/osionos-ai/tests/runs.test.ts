import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(userId: string, workspaceId: string, secret = APP_SECRET): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: secret, sessionTtlSeconds: 3600 },
	}).token;
}

/**
 * The mock upstream comes first, and the environment points at it: the service
 * reads its configuration when it is imported.
 */
const mock = await startMockUpstream();
process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${mock.baseUrl}/v1`;
process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([
	// The free model costs nothing: the runs of the other cases are not bounded
	// by the daily budget.
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
	// The priced model reserves more than the daily limit of one micro-USD.
	{ id: 'mock-priced', label: 'Mock priced', inputMicroUsdPerMTok: 1000, outputMicroUsdPerMTok: 2000 },
]);
// The daily budget of a user: one micro-USD.
process.env.OSIONOS_AI_USER_DAILY_MICROUSD = '1';
process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD = '20000000';
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '100';

const { createAiServer } = await import('../src/server.ts');
const { sweepStaleRuns } = await import('../src/runs/runner.ts');
const { costMicroUsd } = await import('../src/gateway/platform.ts');
const { reserve, settle } = await import('../src/budget.ts');

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
	await mock.close();
});

/** One event of a stream: the id of the frame, its type, its data. */
interface SseEvent {
	id: string;
	event: string;
	data: unknown;
}

/** The events of a stream, read one at a time. */
class SseStream {
	private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly decoder = new TextDecoder();
	private buffer = '';

	constructor(response: Response) {
		this.reader = response.body!.getReader();
	}

	async next(): Promise<SseEvent | null> {
		while (true) {
			const cut = this.buffer.indexOf('\n\n');
			if (cut >= 0) {
				const frame = this.buffer.slice(0, cut);
				this.buffer = this.buffer.slice(cut + 2);
				const parsed = parseFrame(frame);
				if (parsed) return parsed;
				continue;
			}
			const { value, done } = await this.reader.read();
			if (done) return null;
			this.buffer += this.decoder.decode(value, { stream: true });
		}
	}

	/** The connection goes away: the run keeps going on the server. */
	async drop(): Promise<void> {
		await this.reader.cancel();
	}
}

/** One frame of a stream: the id, the type, the data. A ping has no data. */
function parseFrame(frame: string): SseEvent | null {
	let id = '';
	let event = 'message';
	const data: string[] = [];
	for (const line of frame.split('\n')) {
		if (line.startsWith('id: ')) id = line.slice(4);
		else if (line.startsWith('event: ')) event = line.slice(7);
		else if (line.startsWith('data: ')) data.push(line.slice(6));
	}
	if (data.length === 0) return null;
	return { id, event, data: JSON.parse(data.join('\n')) as unknown };
}

/** Every event of a stream, until it ends. */
async function collect(stream: SseStream): Promise<SseEvent[]> {
	const events: SseEvent[] = [];
	while (true) {
		const event = await stream.next();
		if (!event) return events;
		events.push(event);
	}
}

/** A JSON answer of the service. */
async function call(
	path: string,
	options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: JsonBody | null }> {
	const response = await fetch(`${base}${path}`, {
		method: options.method ?? 'GET',
		headers: {
			...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
			...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	let body: JsonBody | null = null;
	try {
		// A body that is not JSON is not an error here: the caller looks at the
		// status, and a stream is not JSON.
		body = text ? (JSON.parse(text) as JsonBody) : null;
	} catch {
		body = null;
	}
	return { status: response.status, body };
}

/** The POST of a run: the answer is a stream. */
function postRun(
	conversationId: string,
	runId: string,
	text: string,
	model?: string,
	token = tokenFor(USER_A, WORKSPACE_A),
): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId, conversationId, text, ...(model ? { model } : {}) }),
	});
}

/** A conversation of the first user. */
async function createConversation(title = 'thread'): Promise<string> {
	const answer = await call('/api/ai/conversations', {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body: { workspaceId: WORKSPACE_A, title },
	});
	assert.equal(answer.status, 201);
	return String(answer.body?.id);
}

/** The text of the deltas of a list of events. */
function textOf(events: SseEvent[]): string {
	return events
		.filter((event) => event.event === 'text.delta')
		.map((event) => (event.data as { text: string }).text)
		.join('');
}

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
		const response = await postRun(conversationId, randomUUID(), 'too expensive', 'mock-priced');
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
		assert.equal(models.length, 2);
		assert.equal(models.filter((model) => model.default).length, 1);
		assert.deepEqual(Object.keys(models[0]).sort(), ['default', 'id', 'label']);
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
});
