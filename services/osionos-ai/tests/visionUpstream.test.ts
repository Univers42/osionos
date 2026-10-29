import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { DATA_POLICY_404, startVisionUpstream } from './mockVisionUpstream.ts';
import { pngBytes } from './visionFixtures.ts';

/**
 * The upstream of a vision run: what it is told, and what it answers.
 *
 * The provider of the platform is the one that carries the images, so its
 * request is the one that must say "deny" — the privacy of the picture is the
 * operator's decision, and no `allow` route exists. The SDK must never fetch
 * a URL: the images are bytes the service fetched itself.
 */

const upstream = await startVisionUpstream();
const { app, base, bridge, mock, tokenFor, createConversation } = await startHarness({
	upstreamBaseUrl: upstream.baseUrl,
});
// The configuration is read when the service is imported, so the modules that
// read it come after the harness.
const { platformModel } = await import('../src/gateway/platform.ts');
const { pumpUpstream } = await import('../src/runs/streamPump.ts');

after(async () => {
	await app.close();
	await mock.close();
	await upstream.close();
});

/** The POST of a run: the body is the one of the test. */
async function postRun(token: string, body: Record<string, unknown>): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** The code of the error of a run, if it failed. */
function errorCodeOf(events: { event: string; data: unknown }[]): string {
	const failure = events.find((event) => event.event === 'error');
	return String((failure?.data as { code?: string } | undefined)?.code ?? '');
}

/** A run with one image, and the events it answers with. */
async function runWithImage(): Promise<{ event: string; data: unknown }[]> {
	const token = tokenFor(USER_A, WORKSPACE_A);
	const conversationId = await createConversation();
	const id = randomUUID();
	bridge.serve(`/api/chat/uploads/${id}`, { bytes: pngBytes(), contentType: 'image/png' });
	const response = await postRun(token, {
		runId: randomUUID(),
		conversationId,
		text: 'what is in this picture?',
		model: VISION.id,
		attachments: [{ kind: 'chat', id }],
	});
	return collect(new SseStream(response));
}

describe('the upstream of a vision run', () => {
	before(() => {
		bridge.reset();
		upstream.status = 200;
		upstream.body = '';
	});

	it('sends the data-collection deny to OpenRouter', async () => {
		const events = await runWithImage();
		assert.equal(events[events.length - 1]?.event, 'done');

		const body = upstream.lastBody() as { provider?: { data_collection?: string } };
		assert.deepEqual(body.provider, { data_collection: 'deny' });
	});

	it('never lets the SDK download a URL', async () => {
		// A server that counts the hits: the SDK must not reach it.
		let hits = 0;
		const server = createServer((request, response) => {
			hits += 1;
			response.writeHead(200, { 'content-type': 'image/png' });
			response.end(Buffer.from(pngBytes()));
		});
		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', () => resolve());
		});
		const address = server.address();
		const port = address && typeof address === 'object' ? address.port : 0;

		const calls = upstream.calls;
		const outcome = await pumpUpstream({
			model: platformModel(VISION.id),
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'what is in this picture?' },
						{ type: 'image', image: `http://127.0.0.1:${port}/image.png`, mediaType: 'image/png' },
					],
				},
			],
			controller: new AbortController(),
			onText: async () => {},
			onReasoning: async () => {},
		});

		assert.ok(outcome.error, 'the run must fail');
		assert.equal(upstream.calls, calls);
		assert.equal(hits, 0);
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	});

	it('turns the answer of OpenRouter about the data policy into a clear error', async () => {
		upstream.status = 404;
		upstream.body = DATA_POLICY_404;

		const events = await runWithImage();

		assert.equal(errorCodeOf(events), 'vision_unavailable');
	});

	it('does not call a plain 404 a vision problem', async () => {
		upstream.status = 404;
		upstream.body = JSON.stringify({ error: { message: 'model not found' } });

		const events = await runWithImage();

		assert.notEqual(errorCodeOf(events), 'vision_unavailable');
		assert.equal(errorCodeOf(events), 'upstream_error');
	});
});
