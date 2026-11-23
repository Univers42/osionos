import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/** The applied list with the flag off (the default): a 404, for an owner and for an anonymous caller alike. */
delete process.env.OSIONOS_AI_MODES;
delete process.env.OSIONOS_AI_MODES_USERS;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('applied list, flag off', () => {
	it('answers 404 to the owner of the conversation', async () => {
		const id = await createConversation('applied-off');
		assert.equal((await call(`/api/ai/conversations/${id}/applied`, { token: tokenFor(USER_A, WORKSPACE_A) })).status, 404);
	});

	it('answers 404 to an anonymous caller too', async () => {
		const id = await createConversation('applied-off-anon');
		assert.equal((await call(`/api/ai/conversations/${id}/applied`)).status, 404);
	});
});
