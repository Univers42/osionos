import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * Custom agents when the deployment has not turned them on (C329): the paths
 * do not exist, a uuid agentId is an unknown agent, and the list is today's.
 * Anything but the exact word `on` leaves them off.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_CUSTOM_AGENTS = 'ON';
	return import('./harness.ts');
})();
const { listedAgents } = await import('../src/agents/builtins.ts');
const { app, mock, bridge, base, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: string }> {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	return { status: response.status, body: await response.text() };
}

describe('C329 custom agents are off unless the flag is exactly on', () => {
	const id = '11111111-1111-4111-8111-111111111111';

	it('C329 every new route answers what an unknown route answers', async () => {
		const unknown = await call('GET', '/api/ai/no-such-route');
		assert.equal(unknown.status, 404);
		for (const [method, path] of [
			['POST', '/api/ai/agents'],
			['GET', `/api/ai/agents/${id}`],
			['PATCH', `/api/ai/agents/${id}`],
			['DELETE', `/api/ai/agents/${id}`],
			['GET', `/api/ai/workspaces/${WORKSPACE_A}/agents/settings`],
			['PUT', `/api/ai/workspaces/${WORKSPACE_A}/agents/settings`],
		] as const) {
			assert.deepEqual(await call(method, path, method === 'GET' ? undefined : {}), unknown, `${method} ${path}`);
		}
	});

	it('C329 GET /api/ai/agents is the built-ins, byte for byte', async () => {
		const answer = await call('GET', '/api/ai/agents');
		assert.equal(answer.body, JSON.stringify(listedAgents()));
	});

	it('C329 a uuid agentId is refused like any unknown agent id', async () => {
		const conversationId = await createConversation();
		const run = (agentId: string) => call('POST', '/api/ai/runs', { runId: crypto.randomUUID(), conversationId, text: 'hi', agentId });
		const unknown = await run('no-such-agent');
		assert.equal(unknown.status, 400);
		assert.equal((await run(id)).status, unknown.status);
		assert.equal((await run(id)).body, unknown.body);
	});
});
