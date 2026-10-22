import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';

/**
 * The sign-in of OpenRouter: PKCE, one click, the key never touches the
 * browser.
 *
 * The field names are the ones of the documentation of OpenRouter
 * (https://openrouter.ai/docs/guides/overview/auth/oauth): `callback_url`,
 * `code_challenge` and `code_challenge_method` on the way out, `code`,
 * `code_verifier` and `code_challenge_method` on the way back.
 */

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORIGIN = 'http://localhost:3001';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(userId: string, workspaceId: string): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
	}).token;
}

/** The mock upstream: the exchange of the sign-in answers here. */
const mock = await startMockUpstream();

process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${mock.baseUrl}/v1`;
process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
]);
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '100';
// The KEK of the envelope, and the hosts of the development escape hatch.
process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 7).toString('base64');
process.env.OSIONOS_AI_KEK_ID = 'k1';
process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
// The exchange of the sign-in goes to the mock.
process.env.OSIONOS_AI_DEV_PROVIDER_BASE_URLS = JSON.stringify({ openrouter: `${mock.baseUrl}/v1` });
// The catalog is out of reach here: the built-in list is the fallback.
process.env.OSIONOS_AI_CATALOG_URL = 'http://127.0.0.1:45999/api.json';

const { createAiServer } = await import('../src/server.ts');

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
	await mock.close();
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

/**
 * The start of a sign-in: the URL the browser goes to, and the state it
 * carries.
 */
async function startSignIn(
	returnUrl = `${ORIGIN}/settings/ai`,
	token = tokenFor(USER_A, WORKSPACE_A),
): Promise<{ url: URL; state: string }> {
	const answer = await call('/api/ai/connections/oauth/openrouter/start', {
		method: 'POST',
		token,
		body: { returnUrl },
	});
	assert.equal(answer.status, 200);
	const url = new URL(String(answer.body?.url));
	const callback = new URL(url.searchParams.get('callback_url') ?? '');
	const state = callback.searchParams.get('state') ?? '';
	return { url, state };
}

describe('osionos-ai openrouter sign-in', () => {
	before(async () => {
		await app.db.query('delete from public.ai_connections');
		// The copy of the catalog of another test must not answer here.
		await app.redis.del('ai:catalog:v1');
		mock.setOptions({ authFail: false });
	});

	it('the start of the sign-in carries the challenge and the state', async () => {
		const { url, state } = await startSignIn();
		assert.equal(url.origin, 'https://openrouter.ai');
		assert.equal(url.pathname, '/auth');
		assert.equal(url.searchParams.get('code_challenge_method'), 'S256');

		// The callback carries the state, so the answer comes back with it.
		const callback = new URL(url.searchParams.get('callback_url') ?? '');
		assert.equal(callback.origin, ORIGIN);
		assert.equal(callback.pathname, '/settings/ai');
		assert.equal(callback.searchParams.get('state'), state);

		// The verifier stays on the server, with the state, for ten minutes.
		const raw = await app.redis.get(`ai:oauth:${state}`);
		assert.ok(raw);
		const stored = JSON.parse(raw) as { userId: string; verifier: string; returnUrl: string };
		assert.equal(stored.userId, USER_A);
		assert.equal(stored.returnUrl, `${ORIGIN}/settings/ai`);
		const challenge = createHash('sha256').update(stored.verifier).digest('base64url');
		assert.equal(url.searchParams.get('code_challenge'), challenge);
		const ttl = await app.redis.ttl(`ai:oauth:${state}`);
		assert.ok(ttl > 0 && ttl <= 600);
	});

	it('a returnUrl of another site is refused', async () => {
		const answer = await call('/api/ai/connections/oauth/openrouter/start', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { returnUrl: 'https://evil.example/steal' },
		});
		assert.equal(answer.status, 400);
		assert.equal(answer.body?.code, 'invalid_request');
	});

	it("another user's state is refused, and it is consumed", async () => {
		const { state } = await startSignIn();

		const foreign = await call('/api/ai/connections/oauth/openrouter/complete', {
			method: 'POST',
			token: tokenFor(USER_B, WORKSPACE_B),
			body: { code: 'the-code', state },
		});
		assert.equal(foreign.status, 404);
		assert.equal(foreign.body?.code, 'not_found');

		// The state is a one-shot ticket: the owner finds nothing either.
		const owner = await call('/api/ai/connections/oauth/openrouter/complete', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { code: 'the-code', state },
		});
		assert.equal(owner.status, 404);
		assert.equal(owner.body?.code, 'not_found');
		const rows = await app.db.query('select id from public.ai_connections where kind = $1', ['oauth']);
		assert.equal(rows.rowCount, 0);
	});

	it('the sign-in creates a connection, and the key stays on the server', async () => {
		const { state } = await startSignIn();
		const answer = await call('/api/ai/connections/oauth/openrouter/complete', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { code: 'the-code', state },
		});
		assert.equal(answer.status, 201);
		const connection = answer.body as { id: string; kind: string; provider: string; label: string; last4?: string };
		assert.equal(connection.kind, 'oauth');
		assert.equal(connection.provider, 'openrouter');
		assert.equal(connection.label, 'OpenRouter');

		// The mock got the code and the verifier of the sign-in.
		const exchange = mock.authBodies[mock.authBodies.length - 1] as {
			code: string;
			code_verifier: string;
			code_challenge_method: string;
		};
		assert.equal(exchange.code, 'the-code');
		assert.equal(exchange.code_challenge_method, 'S256');
		assert.ok(exchange.code_verifier.length > 0);

		// The key of the exchange is nowhere in an answer of the service.
		const key = mock.authKey;
		assert.ok(!JSON.stringify(answer.body).includes(key));
		const list = await call('/api/ai/connections', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.ok(!JSON.stringify(list.body).includes(key));

		// The database holds the envelope, never the key.
		const row = await app.db.query(
			'select secret_box, wrapped_dek, last4, kek_id, status from public.ai_connections where id = $1',
			[connection.id],
		);
		assert.equal(row.rowCount, 1);
		assert.ok(!(row.rows[0].secret_box as Buffer).includes(key));
		assert.ok(!(row.rows[0].wrapped_dek as Buffer).includes(key));
		assert.equal(row.rows[0].kek_id, 'k1');
		// The connection is tested once: the mock answers its list of models.
		assert.equal(row.rows[0].status, 'ok');
	});

	it('an exchange that fails creates no connection', async () => {
		mock.setOptions({ authFail: true });
		const before = await app.db.query('select id from public.ai_connections');
		const { state } = await startSignIn();
		const answer = await call('/api/ai/connections/oauth/openrouter/complete', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { code: 'the-code', state },
		});
		mock.setOptions({ authFail: false });
		assert.equal(answer.status, 400);
		assert.equal(answer.body?.code, 'invalid_request');
		const after = await app.db.query('select id from public.ai_connections');
		assert.equal(after.rowCount, before.rowCount);
	});
});
