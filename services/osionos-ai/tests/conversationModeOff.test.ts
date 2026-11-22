import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/** The mode route with the flag off (the default): a 404, even for a valid session. */
delete process.env.OSIONOS_AI_MODES;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('mode route, flag off', () => {
	it('answers 404 to GET and PATCH', async () => {
		const id = await createConversation('off');
		const token = tokenFor(USER_A, WORKSPACE_A);
		assert.equal((await call(`/api/ai/conversations/${id}/mode`, { token })).status, 404);
		assert.equal((await call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token, body: { mode: 'plan' } })).status, 404);
	});

	it('answers 404 to an anonymous caller too', async () => {
		const id = await createConversation('off-anon');
		assert.equal((await call(`/api/ai/conversations/${id}/mode`)).status, 404);
	});
});
