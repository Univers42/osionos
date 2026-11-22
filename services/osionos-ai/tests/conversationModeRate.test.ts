import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/** The mode route spends the runs bucket: two a minute here, so the third PATCH is refused. */
const USER = '11111111-1111-4111-8111-111111111111';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER;
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '2';

const { startHarness, awaitWindowRoom, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('mode route rate limit', () => {
	it('answers 429 rate_limited to the third PATCH of the window', async () => {
		await awaitWindowRoom();
		const id = await createConversation('rate');
		const token = tokenFor(USER_A, WORKSPACE_A);
		const patch = () => call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token, body: { mode: 'plan' } });
		assert.equal((await patch()).status, 200);
		assert.equal((await patch()).status, 200);
		const third = await patch();
		assert.equal(third.status, 429);
		assert.equal(third.body?.code, 'rate_limited');
	});
});
