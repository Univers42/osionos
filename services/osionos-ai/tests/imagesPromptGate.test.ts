import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { startMockImageEngine } from './mockImageEngine.ts';
import { startMockPromptGuard } from './mockPromptGuard.ts';
import { collect, SseStream } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The prompt gate of the images (devil C72): L0 then L1, synchronous, before
 * anything runs.
 *
 * The guard is a mock on the loopback: its reply, its status and its delay
 * are settable, so a test can make it answer `Unsafe`, answer a 500, hang past
 * the deadline, or not be there at all. The engine is the mock of A1: a test
 * proves that a refused prompt never reaches it.
 *
 * The word of the L0 is READ at runtime, from the first line of the list of
 * the bridge: no unsafe word is written in a test source.
 */
const engine = await startMockImageEngine();
const guard = await startMockPromptGuard();
const PRICE = 40_000;
process.env.OSIONOS_AI_IMAGES = 'on';
process.env.OSIONOS_AI_IMAGE_URL = `${engine.baseUrl}/v1`;
process.env.OSIONOS_AI_IMAGE_MICROUSD = String(PRICE);
process.env.OSIONOS_AI_IMAGE_TIMEOUT_MS = '5000';
process.env.OSIONOS_AI_IMAGE_CHECK_DIR = '/tmp/osionos-ai-check-stub';
process.env.OSIONOS_AI_PROMPT_GUARD_URL = guard.baseUrl;
process.env.OSIONOS_AI_PROMPT_GUARD_MODEL = 'guard';
// A short deadline: the suite must not wait eight seconds to prove that a
// guard that hangs makes the gate fail closed.
process.env.OSIONOS_AI_PROMPT_GUARD_TIMEOUT_MS = '300';

/** The first term of the list of the bridge: read, never written here. */
const BLOCKED = readFileSync(new URL('../../../scripts/moderation-lists/en.txt', import.meta.url), 'utf8')
	.split('\n')
	.map((line) => line.trim())
	.find((line) => line.length > 0) ?? '';

const { startHarness, WORKSPACE_A } = await import('./harness.ts');
const harness = await startHarness({
	// The check of the bytes lets every image through: this file is about the
	// prompt, and C73 has its own.
	outputCheck: { check: async () => ({ refused: false, scores: { falconsai: 0.01, adamcodd: 0.02 } }) },
});
const { app, mock, bridge, base, tokenFor } = harness;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await engine.close();
	await guard.close();
});

/** The POST of an image: the answer is a stream, or a refusal. */
function postImage(userId: string, body: Record<string, unknown>): Promise<Response> {
	return fetch(`${base}/api/ai/images`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(userId, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** The status and the code of a refusal. */
async function refusal(response: Response): Promise<{ status: number; code: string }> {
	const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
	return { status: response.status, code: body?.error?.code ?? '' };
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

/** The row of a run: its state and its failure. */
async function runOf(runId: string): Promise<{ status: string; error: string | null }> {
	const result = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
	return { status: result.rows[0]?.status ?? '', error: result.rows[0]?.error ?? null };
}

/** The data of the one event of a type. */
function dataOf(events: SseEvent[], type: string): Record<string, unknown> {
	const event = events.find((candidate) => candidate.event === type);
	assert.ok(event, `the stream carries ${type}: ${events.map((candidate) => candidate.event).join(',')}`);
	return event.data as Record<string, unknown>;
}

describe('osionos-ai images: the prompt gate (C72)', () => {
	before(() => {
		engine.mode = 'ok';
		engine.reset();
		guard.reset();
		guard.reply = 'Safety: Safe\nCategories: None';
		guard.status = 200;
		guard.delayMs = 0;
	});

	it('a prompt the guard refuses is refused before the engine, and books nothing', async () => {
		engine.reset();
		guard.reset();
		guard.reply = 'Safety: Unsafe\nCategories: Sexual Content';
		const user = randomUUID();
		const runId = randomUUID();
		const prompt = 'a red fox in the snow';
		const response = await postImage(user, { runId, prompt });
		const answer = await refusal(response);

		assert.equal(engine.bodies.length, 0, 'the engine is never called');
		assert.deepEqual(answer, { status: 422, code: 'prompt_refused' });
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 }, 'nothing is charged');
		assert.deepEqual(await runOf(runId), { status: 'failed', error: 'prompt_refused' });

		// The guard received the prompt of the user, once, and nothing else.
		assert.equal(guard.bodies.length, 1);
		assert.deepEqual(Object.keys(guard.bodies[0]).sort(), ['max_tokens', 'messages', 'model', 'stream', 'temperature']);
		assert.deepEqual(guard.bodies[0].messages, [{ role: 'user', content: prompt }]);
	});

	it('a prompt the rules of L0 refuse never reaches the guard nor the engine', async () => {
		engine.reset();
		guard.reset();
		const user = randomUUID();
		const runId = randomUUID();
		const answer = await refusal(await postImage(user, { runId, prompt: `a picture of ${BLOCKED}` }));

		assert.deepEqual(answer, { status: 422, code: 'prompt_refused' });
		assert.equal(guard.bodies.length, 0, 'the guard is never called');
		assert.equal(engine.bodies.length, 0, 'the engine is never called');
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 });
		assert.deepEqual(await runOf(runId), { status: 'failed', error: 'prompt_refused' });
	});

	it('a guard that fails answers 503, and nothing is called and nothing is charged', async () => {
		engine.reset();
		guard.reset();
		guard.status = 500;
		const user = randomUUID();
		const runId = randomUUID();
		const answer = await refusal(await postImage(user, { runId, prompt: 'a red fox in the snow' }));

		guard.status = 200;
		assert.deepEqual(answer, { status: 503, code: 'moderation_unavailable' });
		assert.equal(engine.bodies.length, 0, 'the engine is never called');
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 }, 'nothing is charged');
		assert.deepEqual(await runOf(runId), { status: 'failed', error: 'moderation_unavailable' });
	});

	it('a guard that is not there answers 503, and nothing is called and nothing is charged', async () => {
		engine.reset();
		guard.reset();
		await guard.stop();
		try {
			const user = randomUUID();
			const runId = randomUUID();
			const answer = await refusal(await postImage(user, { runId, prompt: 'a red fox in the snow' }));

			assert.deepEqual(answer, { status: 503, code: 'moderation_unavailable' });
			assert.equal(engine.bodies.length, 0, 'the engine is never called');
			assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 }, 'nothing is charged');
			assert.deepEqual(await runOf(runId), { status: 'failed', error: 'moderation_unavailable' });
		} finally {
			await guard.start();
		}
	});

	it('a guard that hangs past the deadline answers 503, and nothing is called', async () => {
		engine.reset();
		guard.reset();
		guard.delayMs = 5000;
		const user = randomUUID();
		const runId = randomUUID();
		const answer = await refusal(await postImage(user, { runId, prompt: 'a red fox in the snow' }));

		guard.delayMs = 0;
		assert.deepEqual(answer, { status: 503, code: 'moderation_unavailable' });
		assert.equal(engine.bodies.length, 0, 'the engine is never called');
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 }, 'nothing is charged');
	});

	it('a prompt the guard lets through becomes an image', async () => {
		engine.reset();
		guard.reset();
		guard.reply = 'Safety: Safe\nCategories: None';
		const user = randomUUID();
		const runId = randomUUID();
		const response = await postImage(user, { runId, prompt: 'a red fox in the snow' });
		assert.equal(response.status, 200);
		const events = await collect(new SseStream(response));

		assert.deepEqual(events.map((event) => event.event), ['image.started', 'image.done', 'done']);
		assert.equal(engine.bodies.length, 1, 'the engine is called once');
		assert.deepEqual(await runOf(runId), { status: 'succeeded', error: null });
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});

	it('a refused prompt is in no event and in no log line: the codes are (C77, C94)', async () => {
		engine.reset();
		guard.reset();
		const user = randomUUID();
		const runId = randomUUID();
		const prompt = `a picture of ${BLOCKED}`;
		const lines: string[] = [];
		const info = console.info;
		console.info = (...args: unknown[]) => {
			lines.push(args.map((argument) => String(argument)).join(' '));
		};
		try {
			const answer = await refusal(await postImage(user, { runId, prompt }));
			assert.deepEqual(answer, { status: 422, code: 'prompt_refused' });
		} finally {
			console.info = info;
		}

		// The refusal is logged once, with its codes — and with nothing else.
		const refusals = lines.filter((line) => line.includes('prompt_refused'));
		assert.equal(refusals.length, 1);
		const logged = JSON.parse(refusals[0]) as { event: string; runId: string; layer: string; codes: string[] };
		assert.deepEqual(logged, { event: 'prompt_refused', runId, layer: 'l0', codes: ['blocklist'] });
		assert.ok(!lines.join('\n').includes(prompt), 'the prompt is in no log line');
		assert.ok(!lines.join('\n').includes(BLOCKED), 'the term of L0 is in no log line');
	});
});
