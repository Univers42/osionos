import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * "Describe image" without OSIONOS_AI_VLM_URL: the route is what an unknown
 * route is, whatever the caller sends.
 */
delete process.env.OSIONOS_AI_VLM_URL;

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
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify({ path: '/api/media/uploads/00000000-0000-4000-8000-0000000000aa/' + 'a'.repeat(64) + '.png' }),
	});
	return { status: response.status, body: await response.text() };
}

describe('media describe: off by default', () => {
	it('answers exactly what an unknown route answers, and fetches nothing', async () => {
		const described = await post('/api/ai/media/describe');
		const unknown = await post('/api/ai/media/no-such-route');
		assert.equal(described.status, 404);
		assert.deepEqual(described, unknown);
		assert.equal(bridge.count, 0);
	});
});
