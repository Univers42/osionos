import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { pngBytes } from './visionFixtures.ts';

/**
 * The tools of a run never bring an image back.
 *
 * A tool reads the workspace of the caller: a page, a passage. Its result
 * travels to the model as text, and the bytes of a file never enter a run
 * that did not ask for an image.
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

/** The messages of the body the upstream received. */
function messagesOf(body: unknown): { role: string; content: unknown }[] {
	return (body as { messages?: { role: string; content: unknown }[] } | null)?.messages ?? [];
}

describe('the tools of a vision run', () => {
	before(async () => {
		await app.db.query('delete from public.osionos_pages');
		bridge.reset();
		mock.setOptions({ fail: false, chunkCount: 2, preDelayMs: 0, chunkGapMs: 0 });
	});

	it('never brings a binary part back to the model', async () => {
		// A page the caller may read: the model asks for it with its tool.
		const pageId = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
			 values ($1, $2, $3, 'The notes', 'shared', $4::jsonb)`,
			[pageId, WORKSPACE_A, USER_A, JSON.stringify([{ content: 'the text of the page' }])],
		);
		mock.setOptions({ toolCall: { name: 'read_page', arguments: { pageId } } });

		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const response = await postRun(token, {
			runId: randomUUID(),
			conversationId,
			text: 'what do the notes say?',
			model: VISION.id,
		});
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		// The tool ran, and its result travelled back to the model.
		const toolResults = events.filter((event) => event.event === 'tool.result');
		assert.equal(toolResults.length, 1);

		const body = JSON.stringify(mock.lastBody());
		assert.equal(body.includes('the text of the page'), true);
		// No binary part, no image: the result of a tool is text.
		assert.equal(body.includes('image_url'), false);
		assert.equal(body.includes('base64'), false);
		const toolMessages = messagesOf(mock.lastBody()).filter((message) => message.role === 'tool');
		assert.equal(toolMessages.length, 1);
		assert.equal(typeof toolMessages[0]?.content, 'string');
	});

	it('never brings an image back to the model either', async () => {
		// A run with an image, and a tool that reads a page: the result of
		// the tool is text, and the image is the one the user attached.
		const pageId = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
			 values ($1, $2, $3, 'Other notes', 'shared', $4::jsonb)`,
			[pageId, WORKSPACE_A, USER_A, JSON.stringify([{ content: 'other text' }])],
		);
		mock.setOptions({ toolCall: { name: 'read_page', arguments: { pageId } } });

		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation();
		const id = randomUUID();
		bridge.serve(`/api/chat/uploads/${id}`, { bytes: pngBytes(), contentType: 'image/png' });
		const response = await postRun(token, {
			runId: randomUUID(),
			conversationId,
			text: 'what do the notes say?',
			model: VISION.id,
			attachments: [{ kind: 'chat', id }],
		});
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		// The image of the user is in the context of the step that follows
		// the tool, and it is the only one: the tool brought no image.
		const images = messagesOf(mock.lastBody())
			.flatMap((message) => (Array.isArray(message.content) ? message.content : []))
			.filter((part) => (part as { type?: string }).type === 'image_url');
		assert.equal(images.length, 1);
		const toolMessages = messagesOf(mock.lastBody()).filter((message) => message.role === 'tool');
		assert.equal(toolMessages.length, 1);
		assert.equal(typeof toolMessages[0]?.content, 'string');
	});
});
