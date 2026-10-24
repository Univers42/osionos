import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { createAiServer } from '../src/server.ts';
import { appendMessage, listMessages } from '../src/conversations/repo.ts';

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WORKSPACE_SHARED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type JsonBody = Record<string, unknown>;

interface Conversation {
	id: string;
	owner_id: string;
	workspace_id: string;
	title: string;
}

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(userId: string, workspaceId: string, secret = APP_SECRET): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: secret, sessionTtlSeconds: 3600 },
	}).token;
}

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
});

async function call(
	path: string,
	options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: JsonBody | null }> {
	const response = await fetch(`${base}${path}`, {
		method: options.method ?? 'GET',
		headers: {
			...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
			...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as JsonBody) : null };
}

/** The conversations of a list answer. */
function conversationsOf(body: JsonBody | null): Conversation[] {
	const rows = body?.conversations;
	assert.ok(Array.isArray(rows));
	return rows as Conversation[];
}

describe('osionos-ai', () => {
	let conversationId = '';

	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		// A member of a workspace the token does not carry: the members table opens it.
		await app.db.query(
			'insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, $3, $4)',
			[WORKSPACE_SHARED, USER_A, 'admin', ['create', 'read']],
		);
		const created = await call('/api/ai/conversations', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { workspaceId: WORKSPACE_A, title: 'first thread' },
		});
		assert.equal(created.status, 201);
		conversationId = String(created.body?.id);
	});

	it('health reports the database and the cache', async () => {
		const answer = await call('/api/ai/health');
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, db: 'ok', redis: 'ok' });
	});

	it('a request without a token is refused', async () => {
		const answer = await call('/api/ai/conversations', {
			method: 'POST',
			body: { workspaceId: WORKSPACE_A },
		});
		assert.equal(answer.status, 401);
		assert.equal(answer.body?.code, 'unauthorized');
	});

	it('a token signed with another secret is refused', async () => {
		const answer = await call('/api/ai/conversations', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A, 'another-secret'),
			body: { workspaceId: WORKSPACE_A },
		});
		assert.equal(answer.status, 401);
	});

	it('the owner creates a conversation in their own workspace', async () => {
		const answer = await call('/api/ai/conversations', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { workspaceId: WORKSPACE_A, title: 'a title' },
		});
		assert.equal(answer.status, 201);
		assert.equal(answer.body?.owner_id, USER_A);
		assert.equal(answer.body?.workspace_id, WORKSPACE_A);
		assert.equal(answer.body?.title, 'a title');
	});

	it('the owner lists their conversation', async () => {
		const answer = await call(`/api/ai/conversations?workspaceId=${WORKSPACE_A}`, {
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(answer.status, 200);
		assert.ok(conversationsOf(answer.body).some((row) => row.id === conversationId));
	});

	it('a members row opens a workspace the token does not carry', async () => {
		const answer = await call('/api/ai/conversations', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { workspaceId: WORKSPACE_SHARED, title: 'shared' },
		});
		assert.equal(answer.status, 201);
		assert.equal(answer.body?.workspace_id, WORKSPACE_SHARED);
	});

	it('the transcript of a foreign conversation is a 404', async () => {
		const answer = await call(`/api/ai/conversations/${conversationId}/messages`, {
			token: tokenFor(USER_B, WORKSPACE_B),
		});
		assert.equal(answer.status, 404);
	});

	it('a malformed conversation id is a 404', async () => {
		const answer = await call('/api/ai/conversations/not-a-uuid/messages', {
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(answer.status, 404);
	});

	it('the list of another user holds no conversation of somebody else', async () => {
		const answer = await call(`/api/ai/conversations?workspaceId=${WORKSPACE_A}`, {
			token: tokenFor(USER_B, WORKSPACE_B),
		});
		assert.equal(answer.status, 200);
		assert.deepEqual(conversationsOf(answer.body), []);
	});

	it('another user cannot create in a workspace they do not belong to', async () => {
		for (const workspaceId of [WORKSPACE_A, WORKSPACE_SHARED]) {
			const answer = await call('/api/ai/conversations', {
				method: 'POST',
				token: tokenFor(USER_B, WORKSPACE_B),
				body: { workspaceId },
			});
			assert.equal(answer.status, 404);
		}
	});

	it('a body over the cap is a 413', async () => {
		const answer = await call('/api/ai/conversations', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { workspaceId: WORKSPACE_A, title: 'x'.repeat(70_000) },
		});
		assert.equal(answer.status, 413);
	});

	it('an unknown route is a 404', async () => {
		const answer = await call('/api/ai/nothing-here', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 404);
	});

	it('the transcript is written and read by its owner only', async () => {
		const written = await appendMessage(app.db, {
			conversationId,
			ownerId: USER_A,
			role: 'user',
			parts: [{ type: 'text', text: 'hello' }],
		});
		assert.ok(written);
		assert.equal(written.role, 'user');
		const own = await listMessages(app.db, { conversationId, ownerId: USER_A });
		assert.equal(own.length, 1);
		const foreign = await listMessages(app.db, { conversationId, ownerId: USER_B });
		assert.deepEqual(foreign, []);
		const refused = await appendMessage(app.db, {
			conversationId,
			ownerId: USER_B,
			role: 'user',
			parts: [{ type: 'text', text: 'not mine' }],
		});
		assert.equal(refused, null);
	});
});
