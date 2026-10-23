import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/** The endpoint when the deployment has not turned it on: it does not exist. */
delete process.env.OSIONOS_AI_PAT;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function post(path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`,
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
	});
	return { status: response.status, body: await response.text() };
}

describe('the remote MCP endpoint: off by default', () => {
	it('answers what an unknown route answers (404)', async () => {
		const unknown = await post('/api/ai/no-such-route');
		assert.equal(unknown.status, 404);
		assert.deepEqual(await post('/api/ai/mcp'), unknown);
	});
});
