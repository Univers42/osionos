import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startMockImageEngine } from './mockImageEngine.ts';
import { startMockPromptGuard } from './mockPromptGuard.ts';
import { collect, SseStream } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The output check on the generated images (devil C73).
 *
 * The bytes the engine answered are checked before they are stored: an image
 * one of the two classifiers flags is dropped — never uploaded, never in an
 * event — and the run fails with `image_refused`. A check that is not there
 * refuses the request before the queue, the reservation and the engine.
 *
 * No model is loaded here: the check is a stub, and the union of the two
 * scores is a pure function of `src/images/outputCheck.ts`.
 */
const engine = await startMockImageEngine();
// The guard of the prompt (C72): a mock that lets every prompt through.
const guard = await startMockPromptGuard();
const PRICE = 40_000;
process.env.OSIONOS_AI_IMAGES = 'on';
process.env.OSIONOS_AI_IMAGE_URL = `${engine.baseUrl}/v1`;
process.env.OSIONOS_AI_IMAGE_MICROUSD = String(PRICE);
process.env.OSIONOS_AI_IMAGE_TIMEOUT_MS = '5000';
// The configuration needs the directory of the check (C73); the suite brings
// its own stub, so nothing is ever loaded from the disk.
process.env.OSIONOS_AI_IMAGE_CHECK_DIR = '/tmp/osionos-ai-check-stub';
// The configuration needs the guard of the prompt (C72): the mock above is it.
process.env.OSIONOS_AI_PROMPT_GUARD_URL = guard.baseUrl;

/** What the stub of the check answers: the verdict, and the failure it fakes. */
interface Stub {
	refused: boolean;
	scores: Record<string, number>;
	fails: boolean;
}
const stub: Stub = { refused: false, scores: { falconsai: 0.01, adamcodd: 0.02 }, fails: false };

const { startHarness, WORKSPACE_A } = await import('./harness.ts');
const { refusedBy } = await import('../src/images/outputCheck.ts');
const harness = await startHarness({
	outputCheck: {
		check: async (): Promise<{ refused: boolean; scores: Record<string, number> }> => {
			if (stub.fails) throw new Error('the classifier failed');
			return { refused: stub.refused, scores: stub.scores };
		},
	},
});
const { app, mock, bridge, base, tokenFor } = harness;

// A second service, the same database and the same cache, whose check is not
// there at all: the check could not be loaded, and the images are on.
const { createAiServer } = await import('../src/server.ts');
const withoutCheck = createAiServer({ outputCheck: null });
await new Promise<void>((resolve) => {
	withoutCheck.server.listen(0, '127.0.0.1', () => resolve());
});
const address = withoutCheck.server.address();
const withoutCheckBase = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await withoutCheck.close();
	await app.close();
	await mock.close();
	await bridge.close();
	await engine.close();
	await guard.close();
});

/** The POST of an image: the answer is a stream, or a refusal. */
function postImage(
	url: string,
	userId: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return fetch(`${url}/api/ai/images`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(userId, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** One image, start to end. */
async function generate(
	userId: string,
	prompt = 'a red fox in the snow',
): Promise<{ runId: string; events: SseEvent[] }> {
	const runId = randomUUID();
	const response = await postImage(base, userId, { runId, prompt });
	assert.equal(response.status, 200, 'the image started');
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

/** The code of a refusal: the status and the code of the envelope. */
async function refusal(response: Response): Promise<{ status: number; code: string }> {
	const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
	return { status: response.status, code: body?.error?.code ?? '' };
}

describe('osionos-ai images: the check of the generated bytes (C73)', () => {
	before(() => {
		engine.mode = 'ok';
		engine.reset();
		bridge.reset();
		stub.refused = false;
		stub.fails = false;
		stub.scores = { falconsai: 0.01, adamcodd: 0.02 };
	});

	it('a refused image is never uploaded: the run fails with image_refused, and the image is booked', async () => {
		engine.reset();
		bridge.reset();
		stub.refused = true;
		stub.scores = { falconsai: 0.97, adamcodd: 0.93 };
		const user = randomUUID();
		const { runId, events } = await generate(user, 'a cat');

		// The bytes are dropped: no upload, and no image in any event.
		assert.equal(uploads().length, 0);
		assert.ok(!JSON.stringify(events).includes('image/png'), 'no image in the events');
		const error = dataOf(events, 'error');
		assert.equal(error.code, 'image_refused');
		assert.equal(error.message, 'the image was refused by the safety check');
		assert.equal(events[events.length - 1]?.event, 'error');

		// The run is failed by name, and the engine ran: the image is booked.
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { status: 'failed', error: 'image_refused' });
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });

		// C77: the prompt is in no event of the refusal.
		assert.ok(!JSON.stringify(events).includes('a cat'));
	});

	it('an image the check lets through is uploaded, and the run succeeds', async () => {
		engine.reset();
		bridge.reset();
		stub.refused = false;
		stub.scores = { falconsai: 0.02, adamcodd: 0.03 };
		const user = randomUUID();
		const { runId, events } = await generate(user);

		assert.deepEqual(events.map((event) => event.event), ['image.started', 'image.done', 'done']);
		assert.equal(uploads().length, 1);
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { status: 'succeeded', error: null });
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});

	it('a check that is not there refuses the request before the queue, the reservation and the engine', async () => {
		engine.reset();
		bridge.reset();
		const user = randomUUID();
		const runId = randomUUID();
		const answer = await refusal(await postImage(withoutCheckBase, user, { runId, prompt: 'a cat' }));

		assert.deepEqual(answer, { status: 503, code: 'image_check_unavailable' });
		assert.equal(engine.bodies.length, 0, 'the engine is never called');
		assert.equal(uploads().length, 0);
		assert.deepEqual(await ledger(user), { spent: 0, reserved: 0 }, 'nothing is charged');
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { status: 'failed', error: 'image_check_unavailable' });
	});

	it('a check that throws refuses the image: the check fails closed', async () => {
		engine.reset();
		bridge.reset();
		stub.fails = true;
		const user = randomUUID();
		const { runId, events } = await generate(user);
		stub.fails = false;

		assert.equal(uploads().length, 0, 'the bytes are never uploaded');
		assert.equal(dataOf(events, 'error').code, 'image_refused');
		const run = await app.db.query('select status, error from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(run.rows[0], { status: 'failed', error: 'image_refused' });
		assert.deepEqual(await ledger(user), { spent: PRICE, reserved: 0 });
	});
});

describe('osionos-ai images: the union of the two classifiers (C73)', () => {
	it('an image is refused when either model reaches its threshold', () => {
		// Falconsai at 0.5, AdamCodd at 0.9 (the thresholds of A1).
		assert.equal(refusedBy({ falconsai: 0.49, adamcodd: 0.89 }), false);
		assert.equal(refusedBy({ falconsai: 0.5, adamcodd: 0.89 }), true);
		assert.equal(refusedBy({ falconsai: 0.49, adamcodd: 0.9 }), true);
		assert.equal(refusedBy({ falconsai: 0.99, adamcodd: 0.01 }), true);
	});

	it('a score that is missing is not a pass: the check fails closed', () => {
		assert.equal(refusedBy({ falconsai: 0.01 }), true);
		assert.equal(refusedBy({}), true);
	});
});
