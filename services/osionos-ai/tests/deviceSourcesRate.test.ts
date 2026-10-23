import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startHarness } from './harness.ts';
import { startMockEmbedder } from './mockEmbed.ts';
import { Seeds, USER_A, WORKSPACE_A, vectorOf } from './retrievalSeed.ts';

// The window of the sources is tight for this file: the third call is refused.
process.env.OSIONOS_AI_SOURCES_PER_MINUTE = '2';

// The embedding service of the retrieval.
const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const harness = await startHarness();
const db: Pool = harness.app.db;
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

function tokenFor(userId: string, workspaceId: string): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: SECRET, sessionTtlSeconds: 3600 },
	}).token;
}

const seeds = new Seeds(db);
await seeds.clear();

after(async () => {
	await seeds.clear();
	await embedder.close();
	await harness.app.close();
	await harness.mock.close();
});

const QUERY = 'zorblax quux';

describe('the rate limit of the sources', () => {
	it('the 3rd call in the window is 429', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes'),
		});
		const token = tokenFor(USER_A, WORKSPACE_A);
		const first = await fetch(`${harness.base}/api/ai/sources`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ query: QUERY }),
		});
		assert.equal(first.status, 200);
		const second = await fetch(`${harness.base}/api/ai/sources`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ query: QUERY }),
		});
		assert.equal(second.status, 200);
		const third = await fetch(`${harness.base}/api/ai/sources`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ query: QUERY }),
		});
		const body = (await third.json()) as { code?: string };
		assert.equal(third.status, 429);
		assert.equal(body.code, 'rate_limited');
	});
});
