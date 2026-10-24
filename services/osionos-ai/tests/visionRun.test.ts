import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { pngBytes } from './visionFixtures.ts';

/**
 * The attachments of a run: what the request may carry, and where the bytes
 * come from.
 *
 * The client never sends bytes: it sends the id of a chat attachment, or the
 * capability path of a media of a page. Everything else is refused before the
 * service moves, and the bridge is never asked for a URL.
 */

const { app, base, bridge, mock, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

/** The body of a run, with what the test adds to it. */
function runBody(
	conversationId: string,
	extra: Record<string, unknown>,
): Record<string, unknown> {
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

/** The path of a media of a page: the capability path of the bridge. */
function mediaPath(): string {
	return `/api/media/uploads/${randomUUID()}/${'a'.repeat(64)}.png`;
}

describe('the attachments of a run', () => {
	before(() => {
		bridge.reset();
		mock.setOptions({ fail: false });
	});

	it('refuses an attachment that carries a URL, and never asks the bridge', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const response = await postRun(
			token,
			runBody(conversationId, {
				model: VISION.id,
				attachments: [{ kind: 'media', path: 'http://169.254.169.254/latest/meta-data/' }],
			}),
		);

		assert.equal(response.status, 400);
		assert.equal(await codeOf(response), 'invalid_request');
		assert.equal(bridge.count, 0);
		assert.equal(mock.calls, calls);
	});

	it('refuses an attachment that carries a data URL', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const response = await postRun(
			token,
			runBody(conversationId, {
				model: VISION.id,
				attachments: [{ kind: 'media', path: 'data:image/png;base64,iVBORw0KGgo=' }],
			}),
		);

		assert.equal(response.status, 400);
		assert.equal(bridge.count, 0);
		assert.equal(mock.calls, calls);
	});

	it('refuses an attachment that carries a field it does not know', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const response = await postRun(
			token,
			runBody(conversationId, {
				model: VISION.id,
				attachments: [{ kind: 'chat', id: randomUUID(), url: 'http://example.test/x.png' }],
			}),
		);

		assert.equal(response.status, 400);
		assert.equal(bridge.count, 0);
	});

	it('refuses more than four attachments', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const attachments = Array.from({ length: 5 }, () => ({ kind: 'chat', id: randomUUID() }));
		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments }),
		);

		assert.equal(response.status, 400);
		assert.equal(bridge.count, 0);
		assert.equal(mock.calls, calls);
	});

	it('refuses a media path that is not the one of the bridge', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const response = await postRun(
			token,
			runBody(conversationId, {
				model: VISION.id,
				attachments: [{ kind: 'media', path: '/api/media/uploads/not-a-uuid/file.png' }],
			}),
		);

		assert.equal(response.status, 400);
		assert.equal(bridge.count, 0);
	});

	it('refuses an attachment on a model that cannot see images', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const response = await postRun(
			token,
			runBody(conversationId, {
				attachments: [{ kind: 'chat', id: randomUUID() }],
			}),
		);

		assert.equal(response.status, 400);
		assert.equal(await codeOf(response), 'model_no_vision');
		assert.equal(bridge.count, 0);
		assert.equal(mock.calls, calls);
	});

	it('reads a chat attachment at the path of the bridge, with the token of the caller', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, { bytes: pngBytes(), contentType: 'image/png' });
		bridge.reset();

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		assert.equal(bridge.count, 1);
		assert.equal(bridge.calls[0]?.method, 'GET');
		assert.equal(bridge.calls[0]?.path, `/api/chat/uploads/${id}`);
		assert.equal(bridge.calls[0]?.authorization, `Bearer ${token}`);
	});

	it('reads a media of a page at its capability path', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const path = mediaPath();
		bridge.serve(path, { bytes: pngBytes(), contentType: 'image/png' });
		bridge.reset();

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'media', path }] }),
		);
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		assert.equal(bridge.calls[0]?.path, path);
	});

	it('answers a 404 when the bridge does not have the attachment', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, {
			bytes: pngBytes(),
			contentType: 'image/png',
			status: 404,
		});
		bridge.reset();

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 404);
		assert.equal(await codeOf(response), 'attachment_not_found');
		assert.equal(mock.calls, calls);
	});

	it('answers a 404 when the caller may not read the attachment', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, {
			bytes: pngBytes(),
			contentType: 'image/png',
			status: 403,
		});
		bridge.reset();

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 404);
		assert.equal(await codeOf(response), 'attachment_not_found');
		assert.equal(mock.calls, calls);
	});
	it('never follows a redirect of the bridge, so the token goes nowhere else', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const calls = mock.calls;
		const id = randomUUID();
		const elsewhere = `/elsewhere/${id}.png`;
		bridge.serve(elsewhere, { bytes: pngBytes(), contentType: 'image/png' });
		bridge.serve(`/api/chat/uploads/${id}`, {
			bytes: pngBytes(),
			contentType: 'image/png',
			status: 302,
			location: `${bridge.baseUrl}${elsewhere}`,
		});
		bridge.reset();

		const response = await postRun(
			token,
			runBody(conversationId, { model: VISION.id, attachments: [{ kind: 'chat', id }] }),
		);

		assert.equal(response.status, 502);
		assert.equal(await codeOf(response), 'attachment_fetch_failed');
		assert.deepEqual(bridge.calls.map((call) => call.path), [`/api/chat/uploads/${id}`]);
		assert.equal(mock.calls, calls);
	});
});
