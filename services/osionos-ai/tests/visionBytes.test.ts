import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { gpsApp1, jpegBytes, pngBytes, svgBytes, webpBytes } from './visionFixtures.ts';

/**
 * The bytes of an attachment: what the service refuses, and what it sends.
 *
 * The type of an image is the one its BYTES say, not the one the bridge
 * announced: the bridge reads the type it stored, and a file that was stored
 * with the wrong type must not decide what the model sees. The metadata is
 * gone before the bytes leave: an Exif carries the place the picture was
 * taken.
 */

const { app, base, bridge, mock, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

/** The body of a run, with what the test adds to it. */
function runBody(conversationId: string, extra: Record<string, unknown>): Record<string, unknown> {
	return { runId: randomUUID(), conversationId, text: 'what is in this picture?', ...extra };
}

/** The POST of a run: the body is the one of the test. */
async function postRun(token: string, body: Record<string, unknown>): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** The code of a refusal. */
async function codeOf(response: Response): Promise<string> {
	const body = (await response.json()) as { code?: string };
	return String(body.code ?? '');
}

/** The images the upstream received: their type and their bytes. */
function imagesOf(body: unknown): { type: string; bytes: Uint8Array }[] {
	const messages = (body as { messages?: { content?: unknown }[] } | null)?.messages ?? [];
	const found: { type: string; bytes: Uint8Array }[] = [];
	for (const message of messages) {
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content as { type?: string; image_url?: { url?: string } }[]) {
			if (part.type !== 'image_url') continue;
			const url = String(part.image_url?.url ?? '');
			const comma = url.indexOf('base64,');
			if (comma < 0) continue;
			found.push({
				type: url.slice('data:'.length, url.indexOf(';')),
				bytes: new Uint8Array(Buffer.from(url.slice(comma + 'base64,'.length), 'base64')),
			});
		}
	}
	return found;
}

/** Serves the bytes of an attachment, and returns its path and its id. */
function serveAttachment(bytes: Uint8Array, contentType: string): { id: string; path: string } {
	const id = randomUUID();
	const path = `/api/chat/uploads/${id}`;
	bridge.serve(path, { bytes, contentType });
	return { id, path };
}

describe('the bytes of an attachment', () => {
	before(async () => {
		// A run that goes through, so the memory of the process is warm when
		// the test that measures it runs.
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		await collect(new SseStream(await postRun(token, runBody(conversationId, {}))));
	});

	it('refuses a PNG that declares sixty thousand by sixty thousand', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(pngBytes({ width: 60_000, height: 60_000 }), 'image/png');
		const calls = mock.calls;

		const before = process.memoryUsage().rss;
		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);
		const grew = process.memoryUsage().rss - before;

		assert.equal(response.status, 422);
		assert.equal(await codeOf(response), 'image_too_large');
		assert.equal(mock.calls, calls);
		assert.ok(grew < 50 * 1024 * 1024, `the service grew by ${grew} bytes`);
	});

	it('refuses an APNG, which has more than one frame', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(pngBytes({ animated: true }), 'image/png');

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 422);
		assert.equal(await codeOf(response), 'animated_image');
	});

	it('refuses an animated WebP', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(webpBytes({ animated: true }), 'image/webp');

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 422);
		assert.equal(await codeOf(response), 'animated_image');
	});

	it('refuses a corrupt JPEG, and never answers a 500', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(jpegBytes({ corrupt: true }), 'image/jpeg');

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 422);
		assert.equal(await codeOf(response), 'invalid_image');
	});

	it('refuses an SVG that the bridge announces as an image', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(svgBytes(), 'image/png');

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 422);
		assert.equal(await codeOf(response), 'invalid_image');
	});

	it('sends the type the bytes say, not the type the bridge announced', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(pngBytes(), 'image/jpeg');

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		const images = imagesOf(mock.lastBody());
		assert.equal(images.length, 1);
		assert.equal(images[0]?.type, 'image/png');
	});

	it('never sends the Exif of a JPEG to the upstream', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(
			jpegBytes({ width: 8, height: 8, app1: gpsApp1() }),
			'image/jpeg',
		);

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		const images = imagesOf(mock.lastBody());
		assert.equal(images.length, 1);
		const text = Buffer.from(images[0]?.bytes ?? []).toString('latin1');
		assert.equal(text.includes('Exif'), false);
		assert.equal(text.includes('GPSLatitude'), false);
	});

	it('sends no image at all to the next run of the conversation', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const { id } = serveAttachment(pngBytes(), 'image/png');

		const first = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);
		await collect(new SseStream(first));

		const second = await postRun(token, runBody(conversationId, { model: VISION.id }));
		await collect(new SseStream(second));

		assert.equal(imagesOf(mock.lastBody()).length, 0);
		assert.equal(JSON.stringify(mock.lastBody()).includes('attachment'), false);
	});
});
