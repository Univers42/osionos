import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';
import { startMockAnthropic } from './mockAnthropic.ts';
import { catalogFixture, startCatalogServer } from './catalogFixture.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The catalog of models.dev, and the adapters it wires.
 *
 * The catalog is third-party data: the fixture is a trimmed version of it, with
 * one provider per case (an OpenAI-compatible one, Anthropic, Google, one
 * whose SDK we do not speak, and one that is malformed).
 */

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

/** The mock upstream of the OpenAI-compatible wire. */
const mock = await startMockUpstream();
/** The mock upstream of the Anthropic wire. */
const anthropicMock = await startMockAnthropic();
/** The server of the catalog: it answers the fixture. */
const catalogServer = await startCatalogServer(catalogFixture(mock.baseUrl));

process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${mock.baseUrl}/v1`;
process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
]);
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '100';
process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 7).toString('base64');
process.env.OSIONOS_AI_KEK_ID = 'k1';
process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
// The providers of the tests point at their mocks.
process.env.OSIONOS_AI_DEV_PROVIDER_BASE_URLS = JSON.stringify({
	mockcompatible: `${mock.baseUrl}/v1`,
	anthropic: `${anthropicMock.baseUrl}/v1`,
});
// The catalog of the test is the fixture above.
process.env.OSIONOS_AI_CATALOG_URL = catalogServer.url;

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
	await anthropicMock.close();
	await catalogServer.close();
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

/** A connection of the first user, of the kind the test asks for. */
async function createConnection(body: unknown): Promise<JsonBody | null> {
	const answer = await call('/api/ai/connections', {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body,
	});
	assert.equal(answer.status, 201);
	return answer.body;
}

/** A conversation of the first user. */
async function createConversation(): Promise<string> {
	const answer = await call('/api/ai/conversations', {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body: { workspaceId: WORKSPACE_A, title: 'catalog' },
	});
	assert.equal(answer.status, 201);
	return String(answer.body?.id);
}

/** The providers of the answer of the service. */
async function providerList(): Promise<Map<string, { id: string; kind: string; supported: boolean; modelCount: number }>> {
	const answer = await call('/api/ai/providers', { token: tokenFor(USER_A, WORKSPACE_A) });
	assert.equal(answer.status, 200);
	const list = answer.body?.providers as { id: string; kind: string; supported: boolean; modelCount: number }[];
	return new Map(list.map((provider) => [provider.id, provider]));
}

describe('osionos-ai catalog', () => {
	before(async () => {
		await app.db.query('delete from public.ai_connections');
		// The copy of the catalog of another test must not answer here.
		await app.redis.del('ai:catalog:v1');
	});

	it('the providers come from the catalog of models.dev', async () => {
		const providers = await providerList();

		// The provider of the OpenAI-compatible wire is supported, and its
		// models are counted.
		assert.equal(providers.get('mockcompatible')?.supported, true);
		assert.equal(providers.get('mockcompatible')?.modelCount, 2);
		// The Anthropic and the Google adapters speak their wire.
		assert.equal(providers.get('anthropic')?.supported, true);
		assert.equal(providers.get('anthropic')?.modelCount, 1);
		assert.equal(providers.get('google')?.supported, true);
		assert.equal(providers.get('google')?.modelCount, 1);
		// A provider whose SDK we do not speak is in the list, but it cannot be
		// connected.
		assert.equal(providers.get('weird')?.supported, false);
		// The malformed provider is skipped, never fatal.
		assert.equal(providers.has('broken'), false);
		// OpenRouter is the provider the user signs in to, and the endpoint of
		// the user is an entry of its own.
		assert.equal(providers.get('openrouter')?.kind, 'oauth');
		assert.equal(providers.get('endpoint')?.kind, 'endpoint');
		// The built-in providers the catalog does not know are still there.
		assert.equal(providers.get('groq')?.supported, true);
	});

	it('the models of a connection of the catalog carry their prices', async () => {
		const created = await createConnection({ kind: 'api_key', provider: 'mockcompatible', apiKey: KEY });
		const answer = await call(`/api/ai/models?connectionId=${String(created?.id)}`, {
			token: tokenFor(USER_A, WORKSPACE_A),
		});
		assert.equal(answer.status, 200);
		const models = answer.body?.models as {
			id: string;
			label: string;
			default: boolean;
			contextWindow?: number;
			inputMicroUsdPerMTok?: number;
			outputMicroUsdPerMTok?: number;
		}[];
		// The malformed model is skipped, and the prices are in micro-dollars.
		assert.deepEqual(models, [
			{
				id: 'mock-model',
				label: 'Mock Model',
				default: true,
				contextWindow: 128000,
				inputMicroUsdPerMTok: 3_000_000,
				outputMicroUsdPerMTok: 15_000_000,
			},
			{ id: 'mock-free', label: 'Mock Free', default: false, contextWindow: 8192 },
		]);
	});

	it('a run on an anthropic connection speaks the wire of anthropic', async () => {
		const created = await createConnection({ kind: 'api_key', provider: 'anthropic', apiKey: KEY });
		assert.equal(created?.status, 'ok');
		const conversationId = await createConversation();

		const response = await fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				runId: randomUUID(),
				conversationId,
				text: 'hello',
				connectionId: String(created?.id),
				model: 'claude-mock',
			}),
		});
		const events = await collect(new SseStream(response));
		assert.equal(events[events.length - 1]?.event, 'done');
		const text = events
			.filter((event) => event.event === 'text.delta')
			.map((event) => (event.data as { text: string }).text)
			.join('');
		assert.equal(text, 'hello from anthropic ');

		// The mock saw the wire of Anthropic: a POST on /messages, and the key
		// in the header Anthropic uses.
		assert.equal(anthropicMock.calls, 1);
		assert.ok(anthropicMock.paths.every((path) => path.endsWith('/messages')));
		assert.ok(anthropicMock.apiKeys.includes(KEY));
	});

	it('a catalog URL out of reach keeps the built-in list', async () => {
		// The case needs a process of its own: the copy of the catalog lives in
		// the memory of the process, and the URL is read when the service starts.
		const child = fileURLToPath(new URL('./catalogOfflineChild.ts', import.meta.url));
		await app.redis.del('ai:catalog:v1');
		const output = await new Promise<string>((resolve, reject) => {
			const child_ = spawn(process.execPath, ['--experimental-strip-types', child], {
				env: { ...process.env, OSIONOS_AI_CATALOG_URL: 'http://127.0.0.1:45999/api.json' },
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let text = '';
			const collect = (chunk: Buffer) => {
				text += chunk.toString('utf8');
			};
			child_.stdout.on('data', collect);
			child_.stderr.on('data', collect);
			child_.on('close', () => resolve(text));
			child_.on('error', reject);
		});
		const line = output.split('\n').find((entry) => entry.startsWith('RESULT '));
		assert.ok(line, `the child said nothing useful: ${output}`);
		const ids = line
			.replace('RESULT ids=', '')
			.split(',')
			.sort();
		// The built-in list, and the entry of the user's own endpoint.
		assert.deepEqual(ids, [
			'anthropic',
			'deepseek',
			'endpoint',
			'google',
			'groq',
			'mistral',
			'openai',
			'opencode',
			'openrouter',
			'xai',
		]);
	});
});
