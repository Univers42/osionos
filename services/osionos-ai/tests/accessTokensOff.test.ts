import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * The personal access tokens when the deployment has not turned them on
 * (release R-C4a): the paths do not exist, and a valid session cannot mint.
 */
delete process.env.OSIONOS_AI_PAT;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** The status and raw body of a request with a valid session. */
async function call(method: string, path: string): Promise<{ status: number; body: string }> {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: method === 'GET' ? undefined : JSON.stringify({ name: 'x', scopes: ['read'], workspaceIds: [WORKSPACE_A] }),
	});
	return { status: response.status, body: await response.text() };
}

describe('osionos-ai access tokens: off by default (R-C4a)', () => {
	it('GET, POST and DELETE answer what an unknown route answers', async () => {
		const unknownGet = await call('GET', '/api/ai/no-such-route');
		const unknownPost = await call('POST', '/api/ai/no-such-route');
		assert.equal(unknownGet.status, 404);
		assert.deepEqual(await call('GET', '/api/ai/access-tokens'), unknownGet);
		assert.deepEqual(await call('POST', '/api/ai/access-tokens'), unknownPost);
		assert.equal((await call('DELETE', '/api/ai/access-tokens/abc')).status, 404);
	});
});
