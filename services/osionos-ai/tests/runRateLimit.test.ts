import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

// The window of the runs is tight for this file: the second run of the user
// is refused, and the refusal says when to come back.
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '1';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { pngBytes } from './visionFixtures.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The rate limit of the runs says when to come back.
 *
 * The client counts the seconds down before it offers the retry, so the
 * refusal must carry them: a `Retry-After` the reader can trust.
 */

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

describe('the rate limit of the runs', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		mock.setOptions({ fail: false, chunkCount: 2, preDelayMs: 0, chunkGapMs: 0 });
	});

	it('answers a 429 with the seconds the client must wait', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const first = await postRun(token, {
			runId: randomUUID(),
			conversationId: await createConversation(),
			text: 'hello',
		});
		await collect(new SseStream(first));

		const second = await postRun(token, {
			runId: randomUUID(),
			conversationId: await createConversation(),
			text: 'hello again',
		});
		const body = (await second.json()) as { code?: string };

		assert.equal(second.status, 429);
		assert.equal(body.code, 'rate_limited');
		const retryAfter = second.headers.get('retry-after');
		assert.ok(retryAfter, 'the refusal must say when to come back');
		const seconds = Number(retryAfter);
		assert.equal(Number.isFinite(seconds), true);
		assert.equal(seconds > 0 && seconds <= 60, true);

		// A refused run makes the service fetch nothing: the limit comes
		// before the attachments.
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, { bytes: pngBytes(), contentType: 'image/png' });
		bridge.reset();
		const third = await postRun(token, {
			runId: randomUUID(),
			conversationId: await createConversation(),
			text: 'what is in this picture?',
			model: VISION.id,
			attachments: [{ kind: 'chat', id }],
		});
		assert.equal(third.status, 429);
		assert.equal(bridge.calls.length, 0);
	});
});
