import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';
import { SseStream, collect } from './sse.ts';

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'sk-test-0123456789abcdef';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(userId: string, workspaceId: string): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
	}).token;
}

/** The mock comes first: the service reads its configuration when it is imported. */
const mock = await startMockUpstream();
process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${mock.baseUrl}/v1`;
process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
	{ id: 'mock-priced', label: 'Mock priced', inputMicroUsdPerMTok: 1000, outputMicroUsdPerMTok: 2000 },
]);
// The platform budget of the day is empty: a run on the platform is refused.
process.env.OSIONOS_AI_USER_DAILY_MICROUSD = '200000';
process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD = '0';
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '100';
// The KEK of the envelope, and the hosts of the development escape hatch.
process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 7).toString('base64');
process.env.OSIONOS_AI_KEK_ID = 'k1';
process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
process.env.OSIONOS_AI_DEV_PROVIDER_BASE_URLS = JSON.stringify({ openrouter: `${mock.baseUrl}/v1` });
// The catalog of models.dev is out of reach here: the built-in list answers.
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
async function call(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<{ status: number; body: JsonBody | null }> {
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

/** The console of the service, captured while a call happens. */
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

/** A connection of the first user, of the kind the test asks for. */
async function createConnection(body: unknown, token = tokenFor(USER_A, WORKSPACE_A)): Promise<JsonBody | null> {
	const answer = await call('/api/ai/connections', { method: 'POST', token, body });
	assert.equal(answer.status, 201);
	return answer.body;
}

/** A conversation of the first user. */
async function createConversation(): Promise<string> {
	const answer = await call('/api/ai/conversations', {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body: { workspaceId: WORKSPACE_A, title: 'connections' },
	});
	assert.equal(answer.status, 201);
	return String(answer.body?.id);
}

/** A run of the first user: the answer is a stream. */
function postRun(body: Record<string, unknown>, token = tokenFor(USER_A, WORKSPACE_A)): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('osionos-ai connections', () => {
	before(async () => {
		await app.db.query('delete from public.ai_connections');
		await app.db.query('delete from public.ai_usage_daily');
		await app.redis.del('ai:catalog:v1'); // The copy of another test must not answer here.
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false, modelsStatus: 200 });
	});

	it('a connection of a user never shows its key', async () => {
		const console_ = captureConsole();
		const created = await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY, label: 'My router' });
		const list = await call('/api/ai/connections', { token: tokenFor(USER_A, WORKSPACE_A) });
		console_.stop();

		assert.equal(created?.last4, 'cdef');
		assert.equal(created?.status, 'ok');
		assert.ok(!JSON.stringify(created).includes(KEY));
		assert.ok(!JSON.stringify(list.body).includes(KEY));
		// The log of the service never carries the key either.
		assert.ok(!console_.lines.join('\n').includes(KEY));

		// The database holds the envelope, never the key.
		const row = await app.db.query('select secret_box, wrapped_dek, last4, kek_id from public.ai_connections where id = $1', [
			String(created?.id),
		]);
		assert.equal(row.rowCount, 1);
		assert.ok(!(row.rows[0].secret_box as Buffer).includes(KEY));
		assert.ok(!(row.rows[0].wrapped_dek as Buffer).includes(KEY));
		assert.equal(row.rows[0].last4, 'cdef');
		assert.equal(row.rows[0].kek_id, 'k1');
	});

	it('a connection whose provider answers a redirect is an error', async () => {
		mock.setOptions({ modelsStatus: 302 });
		const created = await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY });
		assert.equal(created?.status, 'error');
		assert.equal(created?.statusMessage, 'HTTP 302');
		mock.setOptions({ modelsStatus: 200 });
	});

	it('the models of a connection are the list of its provider', async () => {
		const created = await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY });
		const answer = await call(`/api/ai/models?connectionId=${String(created?.id)}`, { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 200);
		const models = answer.body?.models as { id: string; label: string; default: boolean }[];
		assert.deepEqual(models, [
			{ id: 'mock-model', label: 'mock-model', default: true },
			{ id: 'mock-small', label: 'mock-small', default: false },
		]);
		// The list is cached under the id of the connection, for ten minutes.
		const key = `ai:models:${String(created?.id)}`;
		assert.ok((await app.redis.get(key))?.includes('mock-model'));
		const ttl = await app.redis.ttl(key);
		assert.ok(ttl > 0 && ttl <= 600);
	});

	it("another user's connection does not exist", async () => {
		const created = await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY });
		const id = String(created?.id);
		const foreign = tokenFor(USER_B, WORKSPACE_B);

		const tested = await call(`/api/ai/connections/${id}/test`, { method: 'POST', token: foreign });
		assert.equal(tested.status, 404);
		assert.equal(tested.body?.code, 'not_found');

		const models = await call(`/api/ai/models?connectionId=${id}`, { token: foreign });
		assert.equal(models.status, 404);

		const deleted = await call(`/api/ai/connections/${id}`, { method: 'DELETE', token: foreign });
		assert.equal(deleted.status, 404);

		// The run of a foreign connection is a 404 too.
		const conversationId = await createConversation();
		const body = { runId: randomUUID(), conversationId, text: 'hello', connectionId: id, model: 'mock-model' };
		const run = await postRun(body, foreign);
		assert.equal(run.status, 404);
		await run.text();

		// The owner may delete it: 204, and the row is gone.
		const removed = await call(`/api/ai/connections/${id}`, { method: 'DELETE', token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(removed.status, 204);
		assert.equal(removed.body, null);
		const gone = await app.db.query('select id from public.ai_connections where id = $1', [id]);
		assert.equal(gone.rowCount, 0);
	});

	it('a run on a connection of the user is paid by the user', async () => {
		const created = await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY });
		const connectionId = String(created?.id);
		const conversationId = await createConversation();

		// The platform budget is empty: a run on the platform is refused.
		const refused = await postRun({ runId: randomUUID(), conversationId, text: 'hello', model: 'mock-priced' });
		assert.equal(refused.status, 402);
		await refused.text();

		// A connection of the user needs a model of its own.
		const withoutModel = await postRun({ runId: randomUUID(), conversationId, text: 'hello', connectionId });
		assert.equal(withoutModel.status, 400);
		await withoutModel.text();

		const before = await app.db.query('select subject, spent_microusd, reserved_microusd from public.ai_usage_daily');
		const response = await postRun({ runId: randomUUID(), conversationId, text: 'hello', connectionId, model: 'mock-model' });
		const events = await collect(new SseStream(response));
		assert.equal(events[events.length - 1]?.event, 'done');

		// The mock saw the key of the connection, as a bearer token.
		assert.ok(mock.authorizations.includes(`Bearer ${KEY}`));
		// The ledger of the platform did not move.
		const after = await app.db.query('select subject, spent_microusd, reserved_microusd from public.ai_usage_daily');
		assert.deepEqual(after.rows, before.rows);
		assert.equal(after.rows.find((row) => row.subject === 'platform'), undefined);

		// The usage of the run is recorded, with no cost of ours.
		const usage = events.find((event) => event.event === 'usage');
		assert.equal((usage?.data as { costMicroUsd: number }).costMicroUsd, 0);
	});

	it('the providers are the built-in list', async () => {
		const answer = await call('/api/ai/providers', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 200);
		const list = answer.body?.providers as { id: string; supported: boolean; kind: string }[];
		const providers = new Map(list.map((provider) => [provider.id, provider]));
		assert.deepEqual(
			[...providers.keys()].sort(),
			['anthropic', 'deepseek', 'endpoint', 'google', 'groq', 'mistral', 'openai', 'opencode', 'openrouter', 'xai'],
		);
		// The Anthropic and the Google adapters speak their wire, and OpenRouter
		// is the provider the user signs in to.
		assert.equal(providers.get('anthropic')?.supported, true);
		assert.equal(providers.get('google')?.supported, true);
		assert.equal(providers.get('openrouter')?.kind, 'oauth');
		// The endpoint of the user is an entry of its own.
		assert.equal(providers.get('endpoint')?.kind, 'endpoint');
	});

	it('a provider that is not in the list is refused', async () => {
		const body = { kind: 'api_key', provider: 'no-such-provider', apiKey: KEY };
		const answer = await call('/api/ai/connections', { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body });
		assert.equal(answer.status, 400);
		assert.equal(answer.body?.code, 'provider_not_supported');
	});

	it('an endpoint of a user is checked by the guard', async () => {
		const refused = await call('/api/ai/connections', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { kind: 'endpoint', label: 'my box', baseUrl: 'http://10.1.2.3/v1', apiKey: KEY },
		});
		assert.equal(refused.status, 400);
		assert.equal(refused.body?.code, 'endpoint_not_allowed');
		// The mock of the tests is a development host: it is allowed.
		const created = await createConnection({ kind: 'endpoint', label: 'my box', baseUrl: `${mock.baseUrl}/v1`, apiKey: KEY });
		assert.equal(created?.baseUrl, `${mock.baseUrl}/v1`);
		assert.equal(created?.status, 'ok');
		assert.equal(created?.last4, 'cdef');
	});

	it('the usage of the day is the spend of the caller', async () => {
		const answer = await call('/api/ai/usage', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(answer.status, 200);
		assert.equal(answer.body?.day, new Date().toISOString().slice(0, 10));
		assert.equal(answer.body?.limitMicroUsd, 200000);
		assert.equal(answer.body?.spentMicroUsd, 0);
	});

	it('a user has at most twenty connections', async () => {
		await app.db.query('delete from public.ai_connections');
		for (let index = 0; index < 20; index += 1) {
			await createConnection({ kind: 'api_key', provider: 'openrouter', apiKey: KEY });
		}
		const answer = await call('/api/ai/connections', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { kind: 'api_key', provider: 'openrouter', apiKey: KEY },
		});
		assert.equal(answer.status, 400);
		assert.equal(answer.body?.code, 'invalid_request');
	});
});
