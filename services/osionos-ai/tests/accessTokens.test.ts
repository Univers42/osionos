import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { authenticatePat } from '../src/pat/authenticatePat.ts';

/**
 * The personal access tokens (G4a).
 *
 * The rules these tests hold are the rules of the verdict (C112-C116):
 *   - the token is shown ONCE and stored as a hash (C112);
 *   - a mint needs a FRESH session (C113);
 *   - a PAT opens NOTHING yet, and it is never an administrator (C114);
 *   - the scope of a token is the LIVE membership of its owner (C115);
 *   - the revocation is checked on every call, with no cache (C116).
 */

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const ADMIN_USER = '33333333-3333-4333-8333-333333333333';
const USER_C = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** The admin workspace of the bridge (models/osionos-admin-migration.sql:23). */
const ADMIN_WORKSPACE = '0a4d1c2e-0000-4000-8000-000000000ad1';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(
	userId: string,
	workspaceId: string,
	options: { now?: number; isAdmin?: boolean } = {},
): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
		...(options.now === undefined ? {} : { now: options.now }),
		...(options.isAdmin === undefined ? {} : { isAdmin: options.isAdmin }),
	}).token;
}

/** A request, as the PAT authentication reads it. */
function patRequest(token: string, url = '/api/ai/mcp'): IncomingMessage {
	return { headers: { authorization: `Bearer ${token}` }, url } as unknown as IncomingMessage;
}

// The mock upstream is not needed here: the PAT routes never call a model.
// The environment is set before the service is imported, because the service
// reads its configuration when it is imported.
process.env.OSIONOS_AI_PLATFORM_MODELS ??= JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
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

/** A JSON answer of the service. */
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
	let body: JsonBody | null = null;
	try {
		body = text ? (JSON.parse(text) as JsonBody) : null;
	} catch {
		body = null;
	}
	return { status: response.status, body };
}

/** The console of the service, captured while something happens. */
function captureConsole(): { lines: string[]; stop: () => void } {
	const lines: string[] = [];
	const original = { info: console.info, warn: console.warn, error: console.error };
	const capture = (...args: unknown[]) => {
		lines.push(args.map((value) => String(value)).join(' '));
	};
	console.info = capture;
	console.warn = capture;
	console.error = capture;
	return { lines, stop: () => Object.assign(console, original) };
}

/** A minted token: the answer of the service, and the token itself. */
async function mint(
	userId: string,
	workspaceId: string,
	body: Record<string, unknown> = {},
	options: { now?: number; isAdmin?: boolean } = {},
): Promise<{ id: string; token: string; answer: JsonBody | null }> {
	const answer = await call('/api/ai/access-tokens', {
		method: 'POST',
		token: tokenFor(userId, workspaceId, options),
		body: { name: 'My agent', scopes: ['read'], workspaceIds: [workspaceId], ...body },
	});
	assert.equal(answer.status, 201, `the mint was refused: ${JSON.stringify(answer.body)}`);
	return { id: String(answer.body?.id), token: String(answer.body?.token), answer: answer.body };
}

/** The number of tokens of a user in the table. */
async function countTokens(userId: string): Promise<number> {
	const result = await app.db.query<{ count: string }>(
		'select count(*)::text as count from public.ai_access_tokens where user_id = $1::uuid',
		[userId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

describe('osionos-ai personal access tokens', () => {
	before(async () => {
		await app.db.query('delete from public.ai_access_tokens');
		await app.db.query('delete from public.osionos_workspace_members where user_id = any($1::uuid[])', [
			[USER_A, USER_B, ADMIN_USER],
		]);
		// The window of the mints starts empty: the file spends its own.
		const windows = await app.redis.keys('ai:rl:pat:*');
		if (windows.length > 0) await app.redis.del(...windows);
	});

	// Every test starts with an empty mint window, so the file's own mints
	// never spend each other's budget — and the window itself is tested on
	// its own below.
	beforeEach(async () => {
		const windows = await app.redis.keys('ai:rl:pat:*');
		if (windows.length > 0) await app.redis.del(...windows);
	});

	it('a token minted from a fresh session is shown once and stored as a hash', async () => {
		const minted = await mint(USER_A, WORKSPACE_A);
		assert.match(minted.token, /^osn_pat_[A-Za-z0-9_-]{43}$/);

		const row = await app.db.query(
			'select id, token_sha256, last4, scopes, workspace_ids from public.ai_access_tokens where id = $1::uuid',
			[minted.id],
		);
		assert.equal(row.rowCount, 1);
		assert.equal(
			row.rows[0].token_sha256,
			createHash('sha256').update(minted.token, 'utf8').digest('hex'),
			'the table holds the sha256 of the token',
		);
		assert.equal(row.rows[0].last4, minted.token.slice(-4));

		// Every column of every row, scanned: the token itself is nowhere.
		const scan = await app.db.query('select row_to_json(t)::text as row from public.ai_access_tokens t');
		assert.equal(
			scan.rows.filter((entry) => String(entry.row).includes(minted.token)).length,
			0,
			'the token is in no column of the table',
		);
	});

	it('a session that is not fresh cannot mint a token', async () => {
		const before = await countTokens(USER_A);
		const answer = await call('/api/ai/access-tokens', {
			method: 'POST',
			// Eleven minutes old: the human is not there any more.
			token: tokenFor(USER_A, WORKSPACE_A, { now: Date.now() - 11 * 60 * 1000 }),
			body: { name: 'Stale', scopes: ['read'], workspaceIds: [WORKSPACE_A] },
		});
		assert.equal(answer.status, 403);
		assert.equal(answer.body?.code, 'reauth_required');
		assert.equal(await countTokens(USER_A), before, 'no row was written');
	});

	it('a workspace the caller is not a member of is refused', async () => {
		const answer = await call('/api/ai/access-tokens', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { name: 'Somewhere else', scopes: ['read'], workspaceIds: [WORKSPACE_B] },
		});
		assert.equal(answer.status, 403);
		assert.equal(answer.body?.code, 'workspace_forbidden');
	});

	it('an expiry beyond a year is refused', async () => {
		const answer = await call('/api/ai/access-tokens', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { name: 'Too long', scopes: ['read'], workspaceIds: [WORKSPACE_A], expiresInDays: 400 },
		});
		assert.equal(answer.status, 400);
	});

	it('the list never carries the token, nor its hash', async () => {
		const minted = await mint(USER_A, WORKSPACE_A);
		const answer = await call('/api/ai/access-tokens', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 200);
		const tokens = (answer.body?.tokens ?? []) as Array<Record<string, unknown>>;
		assert.ok(tokens.length >= 1);
		for (const entry of tokens) {
			assert.equal('token' in entry, false);
			assert.equal('tokenSha256' in entry, false);
			assert.equal('token_sha256' in entry, false);
		}
		assert.equal(JSON.stringify(answer.body).includes(minted.token), false);
		assert.equal(JSON.stringify(answer.body).includes(createHash('sha256').update(minted.token).digest('hex')), false);
	});

	it('a token of somebody else does not exist for the caller', async () => {
		const theirs = await mint(USER_B, WORKSPACE_B);
		const foreign = await call(`/api/ai/access-tokens/${theirs.id}`, {
			method: 'DELETE',
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(foreign.status, 404);

		const own = await call(`/api/ai/access-tokens/${theirs.id}`, {
			method: 'DELETE',
			token: tokenFor(USER_B, WORKSPACE_B),
		});
		assert.equal(own.status, 204);
		assert.equal(own.body, null);

		// The revoked token resolves to nothing (C116).
		const principal = await authenticatePat(app.db, patRequest(theirs.token));
		assert.equal(principal, null);
	});

	it('a PAT opens nothing yet', async () => {
		const minted = await mint(USER_A, WORKSPACE_A);
		const calls: Array<{ method: string; path: string }> = [
			{ method: 'GET', path: '/api/ai/access-tokens' },
			{ method: 'POST', path: '/api/ai/access-tokens' },
			{ method: 'POST', path: '/api/ai/runs' },
			{ method: 'POST', path: `/api/ai/approvals/${randomUUID()}` },
			{ method: 'GET', path: '/api/ai/connections' },
			{ method: 'GET', path: '/api/ai/conversations' },
		];
		for (const entry of calls) {
			const answer = await call(entry.path, {
				method: entry.method,
				token: minted.token,
				body: entry.method === 'POST' ? {} : undefined,
			});
			assert.equal(answer.status, 401, `${entry.method} ${entry.path} must refuse a PAT`);
		}
	});

	it('the token of an administrator is never an administrator', async () => {
		// The bridge gives an account-level admin a membership of the admin
		// workspace (scripts/bridge-api.mjs:1489-1499): the user IS an
		// administrator, and the token still is not one (C114).
		await app.db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1::uuid, $2::uuid, $3, $4)
			 on conflict do nothing`,
			[ADMIN_WORKSPACE, ADMIN_USER, 'admin', ['read', 'update', 'admin']],
		);
		const minted = await mint(ADMIN_USER, ADMIN_WORKSPACE, {}, { isAdmin: true });
		const principal = await authenticatePat(app.db, patRequest(minted.token));
		assert.equal(principal?.userId, ADMIN_USER);
		assert.equal(principal?.isAdmin, false);
	});

	it('a token in a query string is refused, whatever the header says', async () => {
		const minted = await mint(USER_A, WORKSPACE_A);
		const principal = await authenticatePat(
			app.db,
			patRequest(minted.token, `/api/ai/mcp?token=${encodeURIComponent(minted.token)}`),
		);
		assert.equal(principal, null);
	});

	it('the token never reaches the log', async () => {
		const minted = await mint(USER_A, WORKSPACE_A);
		const console_ = captureConsole();
		for (let round = 0; round < 100; round += 1) {
			await authenticatePat(app.db, patRequest(minted.token));
		}
		console_.stop();
		assert.equal(console_.lines.join('\n').includes(minted.token), false);
	});

	it('a user mints five tokens in a minute, and the sixth is refused', async () => {
		const session = tokenFor(USER_B, WORKSPACE_B);
		for (let round = 0; round < 5; round += 1) {
			const answer = await call('/api/ai/access-tokens', {
				method: 'POST',
				token: session,
				body: { name: `Agent ${round}`, scopes: ['read'], workspaceIds: [WORKSPACE_B] },
			});
			assert.equal(answer.status, 201);
		}
		const refused = await call('/api/ai/access-tokens', {
			method: 'POST',
			token: session,
			body: { name: 'One too many', scopes: ['read'], workspaceIds: [WORKSPACE_B] },
		});
		assert.equal(refused.status, 429);
		assert.equal(refused.body?.code, 'rate_limited');
	});

	it('a user holds twenty live tokens, and the twenty-first is refused', async () => {
		const session = tokenFor(USER_C, WORKSPACE_A);
		// The window of the mints is emptied before each one: this test is
		// about the cap of the database, not about the rate limit.
		for (let round = 0; round < 20; round += 1) {
			const windows = await app.redis.keys('ai:rl:pat:*');
			if (windows.length > 0) await app.redis.del(...windows);
			const answer = await call('/api/ai/access-tokens', {
				method: 'POST',
				token: session,
				body: { name: `Agent ${round}`, scopes: ['read'], workspaceIds: [WORKSPACE_A] },
			});
			assert.equal(answer.status, 201, `the mint ${round} was refused`);
		}
		const windows = await app.redis.keys('ai:rl:pat:*');
		if (windows.length > 0) await app.redis.del(...windows);
		const refused = await call('/api/ai/access-tokens', {
			method: 'POST',
			token: session,
			body: { name: 'One too many', scopes: ['read'], workspaceIds: [WORKSPACE_A] },
		});
		assert.equal(refused.status, 429);
		assert.equal(refused.body?.code, 'too_many_tokens');
		assert.equal(await countTokens(USER_C), 20, 'the cap holds');
	});
});
