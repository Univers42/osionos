import assert from 'node:assert/strict';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';
import type { MockUpstream } from './mockUpstream.ts';
import { startMockBridge } from './mockBridge.ts';
import type { MockBridge } from './mockBridge.ts';
import type { AiServer } from '../src/server.ts';
import type { OutputCheck } from '../src/images/outputCheck.ts';

/**
 * The harness of the tests: the mock upstream, the service, and the calls
 * that reach it.
 *
 * The service reads its configuration when it is imported, so the environment
 * is set here, before the import, and the import is done at the call: the
 * first harness of a process decides the configuration of that process.
 */

/** The users and the workspaces of the tests. */
export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** The metered model: twenty micro-USD a thousand tokens. */
export const METERED = {
	id: 'mock-metered',
	label: 'Mock metered',
	inputMicroUsdPerMTok: 20_000,
	outputMicroUsdPerMTok: 20_000,
	default: false,
};

/**
 * The platform model: three dollars a million tokens in, fifteen out.
 *
 * It is the price of a real model, and the price the cap of the day is made
 * for: the output of a step is the expensive part of it, and a five-step
 * loop costs more than the cap of a user holds.
 */
export const PLATFORM = {
	id: 'mock-platform',
	label: 'Mock platform',
	inputMicroUsdPerMTok: 3_000_000,
	outputMicroUsdPerMTok: 15_000_000,
	default: false,
};

/** The dear model: one call of it costs more than the daily limit of a user. */
export const DEAR = {
	id: 'mock-dear',
	label: 'Mock dear',
	inputMicroUsdPerMTok: 200_000_000,
	outputMicroUsdPerMTok: 200_000_000,
	default: false,
};

/**
 * The daily budget of a user, in micro-USD.
 *
 * It is the one of the deployment: the reservation of a run is two step
 * ceilings, and the steps after that ask the ledger for what they need, one
 * extension at a time.
 */
export const USER_DAILY_MICROUSD = 200_000;

/** The free model: the runs of the other cases are not bounded by the budget. */
export const FREE = {
	id: 'mock-model',
	label: 'Mock model',
	inputMicroUsdPerMTok: 0,
	outputMicroUsdPerMTok: 0,
	default: true,
};

/**
 * The vision model: it sees the images the user attaches.
 *
 * Its price is one dollar a million tokens, so the reservation of a run with
 * four images is a number a test can read: four images of sixteen hundred
 * tokens are 6 400 micro-USD.
 */
export const VISION = {
	id: 'mock-vision',
	label: 'Mock vision',
	input: ['text', 'image'],
	inputMicroUsdPerMTok: 1_000_000,
	outputMicroUsdPerMTok: 1_000_000,
	default: false,
};

/** A JSON body of the service. */
export type JsonBody = Record<string, unknown>;

/** The harness of a test file. */
export interface Harness {
	/** The mock upstream the service calls. */
	mock: MockUpstream;
	/** The mock bridge the write tools write to. */
	bridge: MockBridge;
	/** The service, and its database. */
	app: AiServer;
	/** The base URL of the service. */
	base: string;
	/** A token the way the bridge signs one. */
	tokenFor(userId: string, workspaceId: string): string;
	/** A JSON answer of the service. */
	call(
		path: string,
		options?: { method?: string; token?: string; body?: unknown },
	): Promise<{ status: number; body: JsonBody | null }>;
	/** The POST of a run: the answer is a stream. */
	postRun(
		conversationId: string,
		runId: string,
		text: string,
		model?: string,
		token?: string,
		pageIds?: string[],
		context?: { pageIds?: string[]; workspace?: boolean },
	): Promise<Response>;
	/** The POST of a completion: the answer is a stream. */
	postComplete(body: JsonBody, token?: string): Promise<Response>;
	/** A conversation of the first user. */
	createConversation(title?: string, token?: string): Promise<string>;
}

/** The secret the tokens are signed with. */
const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

/** A token that carries the member workspaces, the way the bridge mints one. */
export function memberTokenFor(userId: string, workspaceId: string, members: string[] = []): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
		memberWorkspaces: members.map((_id) => ({ _id, role: 'member' })),
	}).token;
}

/** The options of the harness: the upstream of the service may be another one. */
export interface HarnessOptions {
	/**
	 * The base URL of the upstream the service calls.
	 *
	 * The harness brings its own mock; a test that needs a refusal, or a body
	 * it reads, brings its own and says so here.
	 */
	upstreamBaseUrl?: string;
	/**
	 * The output check of the generated images (devil C73).
	 *
	 * The suite never loads a model: a test brings a stub, and a test that
	 * wants the check to be unavailable brings null.
	 */
	outputCheck?: OutputCheck | null;
}

/**
 * The harness: the mock upstream comes first, and the environment points at
 * it.
 */
export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
	const mock = await startMockUpstream();
	// The bridge comes before the service: the URL is read when the
	// configuration is parsed, and the write tools are registered only when
	// there is one.
	const bridge = await startMockBridge();
	process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${options.upstreamBaseUrl ?? mock.baseUrl}/v1`;
	process.env.OSIONOS_AI_BRIDGE_URL = bridge.baseUrl;
	process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([FREE, METERED, PLATFORM, DEAR, VISION]);
	// The daily budget of a user: the same as the deployment's, and the dear
	// model asks for more than that.
	process.env.OSIONOS_AI_USER_DAILY_MICROUSD = String(USER_DAILY_MICROUSD);
	process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD = '20000000';
	// The window of the runs: a test that needs a tight one sets it BEFORE the
	// harness runs, and the harness keeps it.
	process.env.OSIONOS_AI_RUNS_PER_MINUTE = process.env.OSIONOS_AI_RUNS_PER_MINUTE ?? '100';

	const { createAiServer } = await import('../src/server.ts');
	const app = createAiServer({ outputCheck: options.outputCheck });
	// Every file starts with empty run windows. The whole suite runs in under a
	// minute and the Redis is shared, so the files otherwise share one window
	// per user and the late ones get 429 (2026-10-21: started at :01 → 3
	// failures in visionUpstream; started mid-minute → green).
	const windows = await app.redis.keys('ai:rl:*');
	if (windows.length > 0) await app.redis.del(...windows);
	await new Promise<void>((resolve) => {
		app.server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = app.server.address();
	const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

	/** A token the way the bridge signs one: the same module, the test's secret. */
	const tokenFor = (userId: string, workspaceId: string): string =>
		signAppSessionToken({
			payload: { subject: userId, provider: 'test' },
			workspace: { _id: workspaceId },
			config: { appSessionSecret: APP_SECRET, sessionTtlSeconds: 3600 },
		}).token;

	/** A JSON answer of the service. */
	const call = async (
		path: string,
		options: { method?: string; token?: string; body?: unknown } = {},
	): Promise<{ status: number; body: JsonBody | null }> => {
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
			// A body that is not JSON is not an error here: the caller looks at
			// the status, and a stream is not JSON.
			body = text ? (JSON.parse(text) as JsonBody) : null;
		} catch {
			body = null;
		}
		return { status: response.status, body };
	};

	return {
		mock,
		bridge,
		app,
		base,
		tokenFor,
		call,
		postRun(conversationId, runId, text, model, token, pageIds = [], context) {
			return fetch(`${base}/api/ai/runs`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${token ?? tokenFor(USER_A, WORKSPACE_A)}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					runId,
					conversationId,
					text,
					...(model ? { model } : {}),
					...(context
						? { context }
						: pageIds.length > 0
							? { context: { pageIds } }
							: {}),
				}),
			});
		},
		postComplete(body, token) {
			return fetch(`${base}/api/ai/complete`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${token ?? tokenFor(USER_A, WORKSPACE_A)}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify(body),
			});
		},
		async createConversation(title = 'thread', token) {
			const answer = await call('/api/ai/conversations', {
				method: 'POST',
				token: token ?? tokenFor(USER_A, WORKSPACE_A),
				body: { workspaceId: WORKSPACE_A, title },
			});
			assert.equal(answer.status, 201);
			return String(answer.body?.id ?? '');
		},
	};
}
