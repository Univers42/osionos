import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { pngBytes } from './visionFixtures.ts';

/**
 * The money of a vision run: an image costs a ceiling of tokens, and the run
 * holds it before the model is called.
 *
 * The ceiling is a configured number (sixteen hundred tokens by default), and
 * the price is the one of the model. Four images are four times that
 * ceiling, at the price of the model — on top of what the prompt itself
 * costs, which is the same for every run of the test.
 */

/** The tokens an image adds to the reservation. */
const TOKENS_PER_IMAGE = 1600;

const { app, base, bridge, mock, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

/** The POST of a run: the body is the one of the test. */
async function postRun(token: string, body: Record<string, unknown>): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** The money the run held: the reservation of the row. */
async function reservedOf(runId: string): Promise<number> {
	const rows = await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId]);
	return Number(rows.rows[0]?.reserved_microusd ?? 0);
}

/** The attachments of a run: the images the bridge serves. */
function images(count: number): { kind: 'chat'; id: string }[] {
	return Array.from({ length: count }, () => {
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, { bytes: pngBytes(), contentType: 'image/png' });
		return { kind: 'chat' as const, id };
	});
}

/**
 * The money a run holds: the reservation of a run with that many images.
 *
 * Every run of the test is in a conversation of its own, so the history is
 * empty and the prompt is the same: the difference between two reservations
 * is the images, and nothing else.
 */
async function reservedWithImages(count: number): Promise<number> {
	const token = tokenFor(USER_A, WORKSPACE_A);
	const runId = randomUUID();
	const conversationId = await createConversation();
	const response = await postRun(token, {
		runId,
		conversationId,
		text: 'what is in this picture?',
		model: VISION.id,
		...(count > 0 ? { attachments: images(count) } : {}),
	});
	const events = await collect(new SseStream(response));
	assert.equal(events[events.length - 1]?.event, 'done');
	return reservedOf(runId);
}

describe('the money of a vision run', () => {
	before(() => {
		bridge.reset();
		mock.setOptions({ fail: false });
	});

	it('reserves the ceiling of every image on top of what the prompt costs', async () => {
		const plain = await reservedWithImages(0);
		const one = await reservedWithImages(1);
		const four = await reservedWithImages(4);

		const ceiling = Math.ceil((TOKENS_PER_IMAGE * VISION.inputMicroUsdPerMTok) / 1e6);
		assert.equal(ceiling, 1600);
		assert.equal(one - plain, ceiling);
		assert.equal(four - plain, 4 * ceiling);
	});

	it('holds no money for a run that is refused before the model is called', async () => {
		// A run on a model that cannot see the images is refused before the
		// reservation: the row holds nothing.
		const token = tokenFor(USER_A, WORKSPACE_A);
		const runId = randomUUID();
		const conversationId = await createConversation();
		const response = await postRun(token, {
			runId,
			conversationId,
			text: 'what is in this picture?',
			attachments: images(1),
		});
		const body = (await response.json()) as { code?: string };

		assert.equal(response.status, 400);
		assert.equal(body.code, 'model_no_vision');
		assert.equal(await reservedOf(runId), 0);
	});
});
