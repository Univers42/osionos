import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * GET /api/ai/capabilities: which flag-gated features this deployment serves, so the app asks
 * the switch instead of reading a feature's 404 (Chrome logs each one as a console error, #293).
 * One flag on, the others off: each name follows its own flag.
 */
process.env.OSIONOS_AI_PAT = 'on';
delete process.env.OSIONOS_AI_MCP_CLIENT;
delete process.env.OSIONOS_AI_CUSTOM_AGENTS;
delete process.env.OSIONOS_AI_WEB;
delete process.env.OSIONOS_AI_THREAD_ANSWERS;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('osionos-ai capabilities', () => {
	it('names each flag-gated feature with its own switch', async () => {
		const response = await fetch(`${base}/api/ai/capabilities`, {
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}` },
		});
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			capabilities: { accessTokens: true, mcpServers: false, customAgents: false, web: false, threadAnswers: false },
		});
	});

	it('answers 401 without a session', async () => {
		assert.equal((await fetch(`${base}/api/ai/capabilities`)).status, 401);
	});
});
