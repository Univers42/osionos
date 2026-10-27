import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

/**
 * Thread runs when the deployment has not turned them on (C450): the route is
 * the router's own 404, and no model is called.
 */
delete process.env.OSIONOS_AI_THREAD_ANSWERS;
const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, base, mock, bridge, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('thread runs, flag off', () => {
	it('the route does not exist', async () => {
		const calls = mock.calls;
		const response = await fetch(`${base}/api/ai/thread-runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				runId: randomUUID(),
				conversationId: await createConversation('off'),
				channelId: randomUUID(),
				messageId: randomUUID(),
			}),
		});
		assert.equal(response.status, 404);
		await response.body?.cancel();
		// The handler answers a malformed body with 400: a 404 here is the router's.
		const malformed = await fetch(`${base}/api/ai/thread-runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: 'not-a-uuid', text: 'post this' }),
		});
		assert.equal(malformed.status, 404);
		await malformed.body?.cancel();
		assert.equal(mock.calls, calls);
	});
});
