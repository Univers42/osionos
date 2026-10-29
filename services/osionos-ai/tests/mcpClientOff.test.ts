import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * The MCP client when the deployment has not turned it on (C288): the paths
 * do not exist. Anything but the exact word `on` leaves it off.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_MCP_CLIENT = 'ON';
	return import('./harness.ts');
})();
const { app, mock, bridge, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function call(method: string, path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ label: 'x', url: 'https://example.com/mcp' }),
	});
	return { status: response.status, body: await response.text() };
}

describe('C288 the MCP client is off unless the flag is exactly on', () => {
	it('C288 every route answers what an unknown route answers', async () => {
		const id = '11111111-1111-4111-8111-111111111111';
		const unknown = await call('GET', '/api/ai/no-such-route');
		assert.equal(unknown.status, 404);
		for (const [method, path] of [
			['GET', '/api/ai/mcp-servers'],
			['POST', '/api/ai/mcp-servers'],
			['PATCH', `/api/ai/mcp-servers/${id}`],
			['DELETE', `/api/ai/mcp-servers/${id}`],
			['POST', `/api/ai/mcp-servers/${id}/discover`],
			['PATCH', `/api/ai/mcp-servers/${id}/tools/a`],
		] as const) {
			assert.deepEqual(await call(method, path), unknown, `${method} ${path}`);
		}
	});
});
