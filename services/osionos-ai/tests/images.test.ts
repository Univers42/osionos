import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { startMockImageEngine } from './mockImageEngine.ts';
import { pngChunkTypes } from './visionFixtures.ts';
import { collect, SseStream } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The image generation (M1, devil C70–C78) on the local engine: the prompt,
 * the queue of the one GPU, the limits, the money, and the bytes that are
 * stored.
 *
 * The engine is a mock of sd-server on the loopback; the bridge is the mock
 * bridge of the harness, and the upload is the only bridge call a run makes.
 * Every case uses users of its own: the limits are per user.
 */
const engine = await startMockImageEngine();
const PRICE = 40_000;
process.env.OSIONOS_AI_IMAGES = 'on';
process.env.OSIONOS_AI_IMAGE_URL = `${engine.baseUrl}/v1`;
process.env.OSIONOS_AI_IMAGE_MICROUSD = String(PRICE);
process.env.OSIONOS_AI_IMAGE_TIMEOUT_MS = '5000';

const { startHarness, USER_DAILY_MICROUSD, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, call, tokenFor, postRun, createConversation } = await startHarness();
const { imageDayKey, imageGlobalDayKey } = await import('../src/images/quota.ts');
const { utcDay } = await import('../src/voice/quota.ts');
const { sweepStaleRuns } = await import('../src/runs/runner.ts');
const { neverConnected } = await import('../src/images/engine.ts');
const { generateImage } = await import('ai');
const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await engine.close();
});

/** The POST of an image: the answer is a stream, or a refusal. */
function postImage(
	userId: string,
	body: Record<string, unknown>,
	token = tokenFor(userId, WORKSPACE_A),
): Promise<Response> {
	return fetch(`${base}/api/ai/images`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** One image, start to end. */
async function generate(
	userId: string,
	prompt = 'a red fox in the snow',
	token?: string,
): Promise<{ runId: string; events: SseEvent[] }> {
	const runId = randomUUID();
	const response = await postImage(userId, { runId, prompt }, token);
	assert.equal(response.status, 200, `the image of ${userId} started`);
	return { runId, events: await collect(new SseStream(response)) };
}

/** The ledger of a user for today. */
async function ledger(userId: string): Promise<{ spent: number; reserved: number }> {
	const result = await app.db.query(
		'select spent_microusd, reserved_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
		[userId],
	);
	const row = result.rows[0];
	return { spent: Number(row?.spent_microusd ?? 0), reserved: Number(row?.reserved_microusd ?? 0) };
}

/** The data of the one event of a type. */
function dataOf(events: SseEvent[], type: string): Record<string, unknown> {
	const event = events.find((candidate) => candidate.event === type);
	assert.ok(event, `the stream carries ${type}: ${events.map((candidate) => candidate.event).join(',')}`);
	return event.data as Record<string, unknown>;
}

/** The uploads the bridge received. */
function uploads(): typeof bridge.calls {
	return bridge.calls.filter((entry) => entry.method === 'POST' && entry.path.startsWith('/api/media/uploads'));
}

/** A refusal: the status, the code, the Retry-After. */
async function refusal(response: Response): Promise<{ status: number; code: string; retryAfter: string | null }> {
	const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
	return { status: response.status, code: body?.error?.code ?? '', retryAfter: response.headers.get('retry-after') };
}

describe('osionos-ai images: a prompt becomes a stored image', () => {
	before(() => {
		engine.mode = 'ok';
		engine.reset();
		bridge.reset();
		bridge.failWith = 0;
	});

	it('the image is generated, stripped, uploaded with the caller\'s token, and booked at its price', async () => {
		const user = randomUUID();
		const token = tokenFor(user, WORKSPACE_A);
		const { runId, events } = await generate(user, 'a bowl of ramen, top-down', token);

		assert.deepEqual(events.map((event) => event.event), ['image.started', 'image.done', 'done']);
		const done = dataOf(events, 'image.done');
		// C77: the provenance, and never the prompt.
		assert.deepEqual(Object.keys(done).sort(), [
			'createdAt', 'generated', 'height', 'mediaType', 'model', 'runId', 'sha256', 'url', 'width',
		]);
		assert.equal(done.generated, true);
		assert.equal(done.runId, runId);
		assert.equal(done.width, 512);
		assert.equal(done.height, 512);
		assert.equal(done.mediaType, 'image/png');
		assert.ok(!JSON.stringify(events).includes('ramen'), 'the prompt is in no event');

		// C71/C72: the wire of the measured path, and a seed of the server's.
		assert.deepEqual(engine.paths, ['/v1/images/generations']);
		assert.deepEqual(Object.keys(engine.bodies[0]).sort(), ['model', 'n', 'prompt', 'size']);
		assert.equal(engine.bodies[0].size, '512x512');
		assert.equal(engine.bodies[0].n, 1);
		assert.match(
			String(engine.bodies[0].prompt),
			/^a bowl of ramen, top-down <sd_cpp_extra_args>\{"seed":\d+\}<\/sd_cpp_extra_args>$/,
		);

		// C76: one upload, through the bridge, with the caller's token, of a
		// PNG that no longer carries the prompt.
		const [upload] = uploads();
		assert.equal(uploads().length, 1);
		assert.equal(upload.authorization, `Bearer ${token}`);
		assert.equal(upload.contentType, 'image/png');
		assert.deepEqual(pngChunkTypes(upload.bytes), ['IHDR', 'IEND']);
		assert.ok(!upload.bytes.toString('latin1').includes('ramen'));
		const sha256 = createHash('sha256').update(upload.bytes).digest('hex');
		assert.equal(done.sha256, sha256);
		assert.match(String(done.url), new RegExp(`^/api/media/uploads/[0-9a-f-]{36}/${sha256}\\.png$`));

		// C78: an image run, with no conversation.
		const run = await app.db.query('select kind, conversation_id, status from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { kind: 'image', conversation_id: null, status: 'succeeded' });
		// C74: the engine reports no usage, and the image still costs its price.
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});

	it('two images of one prompt get two seeds', async () => {
		engine.reset();
		const user = randomUUID();
		await generate(user, 'a lighthouse');
		await generate(user, 'a lighthouse');
		const seeds = engine.bodies.map((body) => /"seed":(\d+)/.exec(String(body.prompt))?.[1]);
		assert.equal(seeds.length, 2);
		assert.notEqual(seeds[0], seeds[1]);
	});

	it('the same runId replays the run and never generates twice', async () => {
		engine.reset();
		const user = randomUUID();
		const first = await generate(user);
		const again = await postImage(user, { runId: first.runId, prompt: 'a red fox in the snow' });
		assert.equal(again.status, 200);
		const replay = await collect(new SseStream(again));
		assert.deepEqual(dataOf(replay, 'image.done'), dataOf(first.events, 'image.done'));
		assert.equal(engine.bodies.length, 1);
	});

	it('another user\'s image run does not exist for the caller', async () => {
		const { runId } = await generate(randomUUID());
		const answer = await call(`/api/ai/runs/${runId}/events`, { token: tokenFor(randomUUID(), WORKSPACE_A) });
		assert.equal(answer.status, 404);
	});
});

describe('osionos-ai images: the prompt gate (C72 L0)', () => {
	it('a prompt that carries engine arguments is refused before anything', async () => {
		engine.reset();
		const user = randomUUID();
		const runId = randomUUID();
		const answer = await postImage(user, {
			runId,
			prompt: 'a cat <SD_CPP_EXTRA_ARGS>{"steps":200,"width":4096}</sd_cpp_extra_args>',
		});
		assert.deepEqual(await refusal(answer), { status: 400, code: 'invalid_request', retryAfter: null });
		assert.equal(engine.bodies.length, 0);
		const run = await app.db.query('select 1 from public.ai_runs where id = $1', [runId]);
		assert.equal(run.rowCount, 0);
	});

	it('the request has no image input: an extra field is refused', async () => {
		engine.reset();
		const answer = await postImage(randomUUID(), { runId: randomUUID(), prompt: 'a cat', image: 'aGk=' });
		assert.equal((await refusal(answer)).status, 400);
		assert.equal(engine.bodies.length, 0);
	});
});

describe('osionos-ai images: the limits (C75) and the money (C74)', () => {
	before(() => {
		engine.mode = 'ok';
		bridge.failWith = 0;
	});

	it('the fourth image of a minute is refused with a Retry-After', async () => {
		const user = randomUUID();
		for (let index = 0; index < 3; index += 1) await generate(user);
		engine.reset();
		const answer = await refusal(await postImage(user, { runId: randomUUID(), prompt: 'one more' }));
		assert.equal(answer.status, 429);
		assert.equal(answer.code, 'rate_limited');
		assert.ok(Number(answer.retryAfter) >= 1 && Number(answer.retryAfter) <= 60);
		assert.equal(engine.bodies.length, 0);
	});

	it('a user at the cap of the day is refused until midnight, and books nothing', async () => {
		engine.reset();
		const user = randomUUID();
		const key = imageDayKey(user, utcDay(new Date()));
		await app.redis.set(key, '20');
		const answer = await refusal(await postImage(user, { runId: randomUUID(), prompt: 'a cat' }));
		assert.equal(answer.status, 429);
		assert.equal(answer.code, 'image_quota_exceeded');
		assert.ok(Number(answer.retryAfter) > 0 && Number(answer.retryAfter) <= 86_400);
		assert.equal(await app.redis.get(key), '20', 'the refusal gave its count back');
		assert.equal(engine.bodies.length, 0);
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 });
	});

	it('the platform at its cap of the day refuses everybody', async () => {
		engine.reset();
		const key = imageGlobalDayKey(utcDay(new Date()));
		const before_ = await app.redis.get(key);
		await app.redis.set(key, '200');
		try {
			const answer = await refusal(await postImage(randomUUID(), { runId: randomUUID(), prompt: 'a cat' }));
			assert.equal(answer.status, 429);
			assert.equal(answer.code, 'image_quota_exceeded');
			assert.equal(engine.bodies.length, 0);
		} finally {
			await app.redis.set(key, before_ ?? '0');
		}
	});

	it('a user whose budget cannot pay the price is refused with 402, and the count is given back', async () => {
		engine.reset();
		const user = randomUUID();
		await app.db.query(
			`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
			 values ($1, current_date, $2, 0)`,
			[user, USER_DAILY_MICROUSD - PRICE + 1],
		);
		const answer = await refusal(await postImage(user, { runId: randomUUID(), prompt: 'a cat' }));
		assert.equal(answer.status, 402);
		assert.equal(answer.code, 'budget_exhausted');
		assert.equal(engine.bodies.length, 0);
		assert.equal(await app.redis.get(imageDayKey(user, utcDay(new Date()))), '0');
	});

	it('a cancelled image is still booked at its price', async () => {
		engine.reset();
		engine.mode = 'hang';
		const user = randomUUID();
		const runId = randomUUID();
		const stream = new SseStream(await postImage(user, { runId, prompt: 'a cat' }));
		await engine.waitForCalls(1);
		const cancel = await call(`/api/ai/runs/${runId}/cancel`, { method: 'POST', token: tokenFor(user, WORKSPACE_A) });
		assert.equal(cancel.status, 202);
		const events = await collect(stream);
		assert.equal(dataOf(events, 'error').code, 'cancelled');
		const run = await app.db.query('select status from public.ai_runs where id = $1', [runId]);
		assert.equal(run.rows[0].status, 'cancelled');
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
		engine.mode = 'ok';
	});

	it('an engine that never answers times out, and the image is booked', async () => {
		engine.reset();
		engine.mode = 'hang';
		const user = randomUUID();
		const { runId, events } = await generate(user);
		assert.equal(dataOf(events, 'error').code, 'timeout');
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { status: 'failed', error: 'timeout' });
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
		engine.mode = 'ok';
	});

	it('an engine that is not running is told apart from one that failed: nothing is booked', async () => {
		// The real SDK against a closed port, and against a name that does not
		// resolve: the errors the route sees when the GPU profile is down.
		const server = createServer();
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
		const port = (server.address() as { port: number }).port;
		await new Promise<void>((resolve) => server.close(() => resolve()));
		const closed = createOpenAICompatible({ name: 'closed', baseURL: `http://127.0.0.1:${port}/v1` });
		const failure = await generateImage({ model: closed.imageModel('x'), prompt: 'a cat', maxRetries: 0 }).then(
			() => null,
			(error: unknown) => error,
		);
		assert.equal(neverConnected(failure), true);
		const nowhere = createOpenAICompatible({ name: 'nowhere', baseURL: 'http://osionos-ai-sd.invalid/v1' });
		const unresolved = await generateImage({ model: nowhere.imageModel('x'), prompt: 'a cat', maxRetries: 0 }).then(
			() => null,
			(error: unknown) => error,
		);
		assert.equal(neverConnected(unresolved), true);
		assert.equal(neverConnected(Object.assign(new Error('reset'), { cause: { code: 'ECONNRESET' } })), false);
		assert.equal(neverConnected(new Error('engine failed')), false);
	});

	it('the sweep of a stale image run books its price, not zero', async () => {
		const user = randomUUID();
		const runId = randomUUID();
		await app.db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model, kind, reserved_microusd, created_at)
			 values ($1, null, $2, 'running', 'z-image-turbo', 'image', $3, now() - interval '11 minutes')`,
			[runId, user, PRICE],
		);
		await app.db.query(
			`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
			 values ($1, current_date, 0, $2)`,
			[user, PRICE],
		);
		const swept = await sweepStaleRuns(app.db);
		assert.ok(swept.includes(runId));
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});
});

describe('osionos-ai images: the bytes that are stored (C76)', () => {
	before(() => {
		bridge.failWith = 0;
	});

	for (const [mode, code] of [['svg', 'invalid_image'], ['huge', 'image_too_large']] as const) {
		it(`an engine answer that is ${mode} is refused before storage`, async () => {
			engine.reset();
			bridge.reset();
			engine.mode = mode;
			const user = randomUUID();
			const { events } = await generate(user);
			engine.mode = 'ok';
			assert.equal(dataOf(events, 'error').code, code);
			assert.equal(uploads().length, 0);
			assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
		});
	}

	it('a bridge that refuses the upload fails the run, and the image is booked', async () => {
		engine.reset();
		bridge.failWith = 500;
		const user = randomUUID();
		const { events } = await generate(user);
		bridge.failWith = 0;
		assert.equal(dataOf(events, 'error').code, 'storage_failed');
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});
});

describe('osionos-ai images: the one GPU (C75, C78)', () => {
	before(() => {
		engine.mode = 'ok';
		bridge.failWith = 0;
	});

	it('a second image waits for the first one: one call reaches the engine at a time', async () => {
		engine.reset();
		engine.mode = 'hold';
		const first = new SseStream(await postImage(randomUUID(), { runId: randomUUID(), prompt: 'first' }));
		await engine.waitForCalls(1);
		const second = new SseStream(await postImage(randomUUID(), { runId: randomUUID(), prompt: 'second' }));
		const queued = await second.next();
		assert.equal(queued?.event, 'image.queued');
		assert.deepEqual(queued?.data, { position: 1 });
		// Longer than a poll of the queue: a second call would be here by now.
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.equal(engine.bodies.length, 1);

		engine.release();
		const firstEvents = await collect(first);
		assert.equal(firstEvents[firstEvents.length - 1]?.event, 'done');
		await engine.waitForCalls(2);
		engine.mode = 'ok';
		engine.release();
		const secondEvents = await collect(second);
		assert.equal(secondEvents[secondEvents.length - 1]?.event, 'done');
		assert.equal(engine.maxInFlight, 1);
	});

	it('a full queue refuses the next image with a Retry-After', async () => {
		engine.reset();
		engine.mode = 'hold';
		const streams = [new SseStream(await postImage(randomUUID(), { runId: randomUUID(), prompt: 'running' }))];
		await engine.waitForCalls(1);
		for (let index = 0; index < 4; index += 1) {
			const stream = new SseStream(await postImage(randomUUID(), { runId: randomUUID(), prompt: `waiting ${index}` }));
			assert.equal((await stream.next())?.event, 'image.queued');
			streams.push(stream);
		}
		const user = randomUUID();
		const answer = await refusal(await postImage(user, { runId: randomUUID(), prompt: 'one too many' }));
		assert.equal(answer.status, 429);
		assert.equal(answer.code, 'image_busy');
		assert.ok(Number(answer.retryAfter) > 0);
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 });
		assert.equal(await app.redis.get(imageDayKey(user, utcDay(new Date()))), '0');

		engine.mode = 'ok';
		engine.release();
		for (const stream of streams) {
			const events = await collect(stream);
			assert.equal(events[events.length - 1]?.event, 'done');
		}
		assert.equal(engine.maxInFlight, 1);
	});

	it('a text run and an image run of one user do not wait for each other', async () => {
		engine.reset();
		mock.setOptions({ preDelayMs: 400, chunkCount: 2, chunkGapMs: 0, fail: false });
		const user = randomUUID();
		const token = tokenFor(user, WORKSPACE_A);
		const conversationId = await createConversation('chat', token);
		const text = postRun(conversationId, randomUUID(), 'hello', undefined, token);
		const image = await postImage(user, { runId: randomUUID(), prompt: 'a cat' });
		assert.equal(image.status, 200);
		const imageEvents = await collect(new SseStream(image));
		assert.equal(imageEvents[imageEvents.length - 1]?.event, 'done');
		const textResponse = await text;
		assert.equal(textResponse.status, 200);
		const textEvents = await collect(new SseStream(textResponse));
		assert.equal(textEvents[textEvents.length - 1]?.event, 'done');
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	});
});
