import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startHarness } from './harness.ts';
import { startMockEmbedder } from './mockEmbed.ts';
import { Seeds, USER_A, USER_B, USER_C, WORKSPACE_A, WORKSPACE_B, vectorOf } from './retrievalSeed.ts';

// The embedding service of the retrieval: the mock, at the address the
// service reads when it embeds a question.
const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const harness = await startHarness();
const db: Pool = harness.app.db;
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

function tokenFor(userId: string, workspaceId: string, members: string[] = []): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: SECRET, sessionTtlSeconds: 3600 },
		memberWorkspaces: members.map((_id) => ({ _id, role: 'member' })),
	}).token;
}

const QUERY = 'zorblax quux';

const seeds = new Seeds(db);

before(async () => {
	await seeds.clear();
});
beforeEach(async () => {
	await seeds.clear();
});
after(async () => {
	await seeds.clear();
	await embedder.close();
	await harness.app.close();
	await harness.mock.close();
});

const SIX_KEYS = ['blockId', 'headingPath', 'pageId', 'score', 'snippet', 'title'].sort();

async function postSources(token: string | null, body: unknown): Promise<{ status: number; body: any }> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (token) headers.authorization = `Bearer ${token}`;
	const response = await fetch(`${harness.base}/api/ai/sources`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	const text = await response.text();
	let parsed: any = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = null;
	}
	return { status: response.status, body: parsed };
}

describe('the sources of a device run', () => {
	it('(a) no token -> 401, and nothing else in the body', async () => {
		const answer = await postSources(null, { query: QUERY });
		assert.equal(answer.status, 401);
		assert.equal(answer.body?.sources, undefined);
	});

	it('(b) user A, member of workspace A, asks a question that matches a page of A -> at least one source, with exactly the six keys', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes'),
		});
		const answer = await postSources(tokenFor(USER_A, WORKSPACE_A), { query: QUERY });
		assert.equal(answer.status, 200, JSON.stringify(answer.body));
		const sources = answer.body?.sources ?? [];
		assert.ok(sources.length >= 1, 'at least one source');
		assert.deepEqual(Object.keys(sources[0]).sort(), SIX_KEYS);
	});

	it('(c) user B, not a member of A, same question -> sources: []', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes'),
		});
		const answer = await postSources(tokenFor(USER_B, WORKSPACE_B), { query: QUERY });
		assert.equal(answer.status, 200, JSON.stringify(answer.body));
		assert.deepEqual(answer.body?.sources, []);
	});

	it('(d) a token that still lists workspace A in memberWorkspaces for a user who is NOT in the live members table -> sources: []', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes'),
		});
		const answer = await postSources(tokenFor(USER_B, WORKSPACE_B, [WORKSPACE_A]), { query: QUERY });
		assert.equal(answer.status, 200, JSON.stringify(answer.body));
		assert.deepEqual(answer.body?.sources, []);
	});

	it('(e) a private page of A owned by someone else is never returned to a plain member of A, while the owner gets it', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Private notes',
			visibility: 'private',
			content: `the ${QUERY} of the owner`,
			embedding: vectorOf('private notes'),
		});
		// plain member B of A
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, 'member', array['read'])`,
			[WORKSPACE_A, USER_B],
		);
		const memberAnswer = await postSources(tokenFor(USER_B, WORKSPACE_B), { query: QUERY });
		assert.equal(memberAnswer.status, 200, JSON.stringify(memberAnswer.body));
		const memberSources = memberAnswer.body?.sources ?? [];
		assert.equal(memberSources.length, 0, 'plain member gets nothing');
		// owner
		const ownerAnswer = await postSources(tokenFor(USER_A, WORKSPACE_A), { query: QUERY });
		assert.equal(ownerAnswer.status, 200, JSON.stringify(ownerAnswer.body));
		assert.ok((ownerAnswer.body?.sources ?? []).length >= 1, 'owner gets it');
	});

	it('(f) limit: 1 -> at most 1 source; invalid bodies -> 400', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes one',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes one'),
		});
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes two',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes two'),
		});
		const ok = await postSources(tokenFor(USER_A, WORKSPACE_A), { query: QUERY, limit: 1 });
		assert.equal(ok.status, 200, JSON.stringify(ok.body));
		assert.ok((ok.body?.sources ?? []).length <= 1);

		const cases = [
			{ query: QUERY, limit: 0 },
			{ query: QUERY, limit: 21 },
			{ query: '' },
			{ query: '   ' },
			{ query: 'a'.repeat(2001) },
			{ query: QUERY, extra: true },
		];
		for (const c of cases) {
			const answer = await postSources(tokenFor(USER_A, WORKSPACE_A), c);
			assert.equal(answer.status, 400, `expected 400 for ${JSON.stringify(c)}, got ${answer.status}`);
		}
	});
});
