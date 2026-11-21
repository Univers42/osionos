import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

/**
 * Public mode mints `read` tokens only (FB8): `write_approval` waits for a
 * live approve-and-deny e2e of an MCP proposal.
 */
const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

process.env.OSIONOS_AI_PAT = 'on';
process.env.OSIONOS_AI_PUBLIC_MODE = 'on';
process.env.OSIONOS_AI_PLATFORM_MODELS ??= JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true, dataUse: 'no-train' },
]);

const { createAiServer } = await import('../src/server.ts');
const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
});

beforeEach(async () => {
	const windows = await app.redis.keys('ai:rl:pat:*');
	if (windows.length > 0) await app.redis.del(...windows);
});

/** POST a mint with a fresh session and the given scopes. */
async function mint(scopes: string[]): Promise<{ status: number; body: Record<string, unknown> }> {
	const token = signAppSessionToken({
		payload: { subject: USER, provider: 'test' },
		workspace: { _id: WORKSPACE },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
	}).token;
	const response = await fetch(`${base}/api/ai/access-tokens`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Claude', scopes, workspaceIds: [WORKSPACE] }),
	});
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('osionos-ai access tokens in public mode (FB8)', () => {
	it('a mint with write_approval is refused with 400 scope_not_allowed', async () => {
		const answer = await mint(['read', 'write_approval']);
		assert.equal(answer.status, 400);
		assert.equal(answer.body.code, 'scope_not_allowed');
	});

	it('a read-only mint still answers 201', async () => {
		const answer = await mint(['read']);
		assert.equal(answer.status, 201);
	});
});
