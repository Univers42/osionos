import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, cutoffPoller } from './auth.ts';
import { config } from './config.ts';
import { createPool } from './db.ts';
import { readJson, sendError, sendJson, sendPreflight, sendSseHeaders, writeSseFrame, writeSsePing } from './http.ts';
import { canAccessWorkspace } from './workspaceAccess.ts';
import { createConversation, getOwnedConversation, listConversations, listMessages } from './conversations/repo.ts';
import { platformModels, resolveModel } from './gateway/platform.ts';
import { getOwnedRun } from './runs/repo.ts';
import { startRun, sweepStaleRuns } from './runs/runner.ts';
import * as runStore from './runs/runStore.ts';

/** The UUID shape the bridge's tokens carry (scripts/bridge-session-token.mjs:10). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createConversationSchema = z.object({
	workspaceId: z.string().regex(UUID, 'workspaceId must be a uuid'),
	title: z.string().max(200).optional(),
});

const startRunSchema = z.object({
	runId: z.string().regex(UUID, 'runId must be a uuid'),
	conversationId: z.string().regex(UUID, 'conversationId must be a uuid'),
	text: z.string().min(1).max(32_000),
	model: z.string().min(1).optional(),
});

/** A quiet stream is kept alive with a comment every fifteen seconds. */
const SSE_PING_MS = 15_000;
/** The sweep of the stale runs: once a minute. */
const SWEEP_INTERVAL_MS = 60_000;

export interface AiServer {
	server: ReturnType<typeof createServer>;
	db: Pool;
	redis: Redis;
	blockingRedis: Redis;
	close(): Promise<void>;
}

/** The Redis client of the service: it connects on demand and gives up in a second. */
function createRedisClient(redisUrl: string, commandTimeoutMs = 1_000): Redis {
	const client = new Redis(redisUrl, {
		lazyConnect: true,
		connectTimeout: 1_000,
		commandTimeout: commandTimeoutMs,
		maxRetriesPerRequest: 1,
	});
	// The client retries on its own; the log carries the failure's name, never the URL.
	client.on('error', (error: Error) => {
		console.warn(JSON.stringify({ event: 'redis_error', code: error.name }));
	});
	return client;
}

/** A promise that loses against the clock. */
async function withDeadline<T>(run: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error('deadline_exceeded')), timeoutMs);
	});
	try {
		return await Promise.race([run, deadline]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function checkDatabase(db: Pool): Promise<'ok' | 'down'> {
	try {
		await withDeadline(db.query('select 1'), 1_000);
		return 'ok';
	} catch {
		return 'down';
	}
}

async function checkRedis(redis: Redis): Promise<'ok' | 'down'> {
	try {
		await withDeadline(redis.ping(), 1_000);
		return 'ok';
	} catch {
		return 'down';
	}
}

/** The status and the code of a failure; the internals stay in the process. */
function failureCode(error: unknown): { status: number; code: string } {
	const candidate = error as { status?: unknown; code?: unknown } | null;
	return {
		status: typeof candidate?.status === 'number' ? candidate.status : 500,
		code: typeof candidate?.code === 'string' ? candidate.code : 'internal_error',
	};
}

/** One log line per request: the method, the route, the status, the time. No body, no header. */
function logRequest(request: IncomingMessage, route: string, status: number, ms: number): void {
	console.info(JSON.stringify({ event: 'request', method: request.method ?? '', route, status, ms }));
}

/** The dependencies of a request: the database, the cache, and the blocking reader. */
interface RequestDeps {
	db: Pool;
	redis: Redis;
	blockingRedis: Redis;
}

/** The ping of a stream, and the way to stop it. */
function startPing(response: ServerResponse): () => void {
	const timer = setInterval(() => writeSsePing(response), SSE_PING_MS);
	const stop = () => clearInterval(timer);
	response.on('close', stop);
	return stop;
}

/**
 * The events of a run, after the id the client last saw: the replay first, then
 * the live ones, each event exactly once.
 *
 * The client closing the connection stops the reading, never the run: the run
 * keeps going and stays resumable.
 */
async function streamRunEvents(
	deps: RequestDeps,
	runId: string,
	afterId: string,
	response: ServerResponse,
): Promise<void> {
	const controller = new AbortController();
	const stop = () => controller.abort();
	response.on('close', stop);
	try {
		const entries = await runStore.readAfter(deps.redis, runId, afterId);
		for (const entry of entries) writeSseFrame(response, entry);
		const last = entries.length > 0 ? entries[entries.length - 1] : undefined;
		if (last && runStore.TERMINAL_TYPES.has(last.type)) return;
		await runStore.follow(
			deps.blockingRedis,
			runId,
			last?.id ?? afterId,
			(entry) => writeSseFrame(response, entry),
			controller.signal,
		);
	} finally {
		response.off('close', stop);
	}
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	deps: RequestDeps,
): Promise<void> {
	const { db, redis } = deps;
	const startedAt = Date.now();
	let status = 500;
	let route = 'unknown';
	try {
		if (request.method === 'OPTIONS') {
			route = 'preflight';
			sendPreflight(response);
			status = 204;
			return;
		}
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		const pathname = url.pathname;

		if (request.method === 'GET' && pathname === '/api/ai/health') {
			route = '/api/ai/health';
			const [database, cache] = await Promise.all([checkDatabase(db), checkRedis(redis)]);
			status = 200;
			sendJson(response, status, { ok: database === 'ok' && cache === 'ok', db: database, redis: cache });
			return;
		}

		const messages = /^\/api\/ai\/conversations\/([^/]+)\/messages$/.exec(pathname);
		if (request.method === 'GET' && messages) {
			route = '/api/ai/conversations/:id/messages';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			const conversationId = messages[1];
			// A conversation of somebody else is a 404, never a 403: the answer must not
			// tell that it exists. An id that is no uuid is a 404 as well.
			if (!UUID.test(conversationId)) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			const conversation = await getOwnedConversation(db, { id: conversationId, ownerId: user.userId });
			if (!conversation) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			const transcript = await listMessages(db, { conversationId, ownerId: user.userId });
			status = 200;
			sendJson(response, status, { conversationId, messages: transcript });
			return;
		}

		if (pathname === '/api/ai/conversations') {
			route = '/api/ai/conversations';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			if (request.method === 'POST') {
				const body = await readJson(request, createConversationSchema);
				const allowed = await canAccessWorkspace(db, user, body.workspaceId, 'create');
				if (!allowed) {
					status = 404;
					sendError(response, status, 'not_found');
					return;
				}
				const conversation = await createConversation(db, {
					ownerId: user.userId,
					workspaceId: body.workspaceId,
					title: body.title ?? '',
				});
				status = 201;
				sendJson(response, status, conversation);
				return;
			}
			if (request.method === 'GET') {
				const workspaceId = url.searchParams.get('workspaceId') ?? '';
				if (!UUID.test(workspaceId)) {
					status = 400;
					sendError(response, status, 'invalid_request');
					return;
				}
				// The owner filter is the gate: the answer holds the caller's own
				// conversations of that workspace, and nothing else.
				const conversations = await listConversations(db, {
					ownerId: user.userId,
					workspaceId,
					limit: 50,
				});
				status = 200;
				sendJson(response, status, { conversations });
				return;
			}
			status = 405;
			sendError(response, status, 'method_not_allowed');
			return;
		}

		if (request.method === 'GET' && pathname === '/api/ai/models') {
			route = '/api/ai/models';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			// The prices stay on the server: the client only needs to show a name.
			status = 200;
			sendJson(response, status, {
				models: platformModels().map((model) => ({ id: model.id, label: model.label, default: model.default })),
			});
			return;
		}

		if (request.method === 'POST' && pathname === '/api/ai/runs') {
			route = '/api/ai/runs';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			const body = await readJson(request, startRunSchema);
			const model = resolveModel(body.model);
			if (!model) {
				status = 400;
				sendError(response, status, 'model_not_allowed');
				return;
			}
			const conversation = await getOwnedConversation(db, { id: body.conversationId, ownerId: user.userId });
			if (!conversation) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			const outcome = await startRun({
				db,
				redis,
				runId: body.runId,
				conversationId: body.conversationId,
				ownerId: user.userId,
				text: body.text,
				model,
				emit: (event) => writeSseFrame(response, event),
			});
			if (outcome.kind === 'refused') {
				status = outcome.status;
				sendError(response, status, outcome.code);
				return;
			}
			if (outcome.kind === 'reattach') {
				// The same run, asked again: the stream is replayed, and no model is
				// called a second time.
				if (!(await runStore.exists(redis, body.runId))) {
					status = 410;
					sendError(response, status, 'run_expired');
					return;
				}
				status = 200;
				sendSseHeaders(response);
				const stopPing = startPing(response);
				await streamRunEvents(deps, body.runId, '', response);
				stopPing();
				if (!response.writableEnded && !response.destroyed) response.end();
				return;
			}
			status = 200;
			sendSseHeaders(response);
			const stopPing = startPing(response);
			try {
				await outcome.execute();
			} finally {
				stopPing();
				if (!response.writableEnded && !response.destroyed) response.end();
			}
			return;
		}

		const runEvents = /^\/api\/ai\/runs\/([^/]+)\/events$/.exec(pathname);
		if (request.method === 'GET' && runEvents) {
			route = '/api/ai/runs/:id/events';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			const runId = runEvents[1];
			if (!UUID.test(runId)) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			// The owner check is the gate: a run of somebody else does not exist
			// for this caller.
			const run = await getOwnedRun(db, { id: runId, ownerId: user.userId });
			if (!run) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			if (!(await runStore.exists(redis, runId))) {
				status = 410;
				sendError(response, status, 'run_expired');
				return;
			}
			const header = request.headers['last-event-id'];
			const afterId =
				(typeof header === 'string' && header.length > 0 ? header : url.searchParams.get('after')) ?? '';
			status = 200;
			sendSseHeaders(response);
			const stopPing = startPing(response);
			await streamRunEvents(deps, runId, afterId, response);
			stopPing();
			if (!response.writableEnded && !response.destroyed) response.end();
			return;
		}

		const runCancel = /^\/api\/ai\/runs\/([^/]+)\/cancel$/.exec(pathname);
		if (request.method === 'POST' && runCancel) {
			route = '/api/ai/runs/:id/cancel';
			const user = authenticate(request);
			if (!user) {
				status = 401;
				sendError(response, status, 'unauthorized');
				return;
			}
			const runId = runCancel[1];
			if (!UUID.test(runId)) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			const run = await getOwnedRun(db, { id: runId, ownerId: user.userId });
			if (!run) {
				status = 404;
				sendError(response, status, 'not_found');
				return;
			}
			// The cancellation travels on the channel: the replica that runs the
			// model is the one that stops it.
			await runStore.publishCancel(redis, runId);
			status = 202;
			sendJson(response, status, { ok: true, runId });
			return;
		}

		status = 404;
		sendError(response, status, 'not_found');
	} catch (error) {
		const failure = failureCode(error);
		status = failure.status;
		console.warn(JSON.stringify({ event: 'request_failed', route, status, code: failure.code }));
		if (!response.headersSent) sendError(response, status, failure.code);
		else response.end();
	} finally {
		logRequest(request, route, status, Date.now() - startedAt);
	}
}

/**
 * The service, in this process: one pool, one Redis client, one HTTP server.
 * The tests drive it in-process; the boot path listens on the configured port.
 */
export function createAiServer(): AiServer {
	const db = createPool(config.databaseUrl);
	const redis = createRedisClient(config.redisUrl);
	// The blocking read needs a connection of its own: a blocked Redis client
	// answers nobody else. The subscriber needs one too: a subscribed client
	// only speaks subscriptions.
	const blockingRedis = createRedisClient(config.redisUrl, 30_000);
	const subscriber = createRedisClient(config.redisUrl, 30_000);
	void runStore.listenForCancels(subscriber).catch((error: Error) => {
		console.warn(JSON.stringify({ event: 'cancel_listener_failed', code: error.name }));
	});
	// The sweep of the stale runs: at boot, and then every minute.
	const sweep = setInterval(() => {
		void sweepStaleRuns(db).catch((error: Error) => {
			console.warn(JSON.stringify({ event: 'sweep_failed', code: error.name }));
		});
	}, SWEEP_INTERVAL_MS);
	sweep.unref();
	void sweepStaleRuns(db).catch((error: Error) => {
		console.warn(JSON.stringify({ event: 'sweep_failed', code: error.name }));
	});
	const server = createServer((request, response) => {
		void handleRequest(request, response, { db, redis, blockingRedis });
	});
	return {
		server,
		db,
		redis,
		blockingRedis,
		async close(): Promise<void> {
			clearInterval(sweep);
			cutoffPoller.stop();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeIdleConnections();
			});
			await db.end();
			for (const client of [redis, blockingRedis, subscriber]) {
				try {
					await client.quit();
				} catch {
					client.disconnect();
				}
			}
		},
	};
}

/** The boot path: listen, and on SIGTERM stop accepting, close everything, exit 0. */
export function startAiServer(): AiServer {
	const app = createAiServer();
	app.server.listen(config.port, '0.0.0.0', () => {
		console.info(JSON.stringify({ event: 'listening', port: config.port }));
	});
	const shutdown = (signal: string) => {
		console.info(JSON.stringify({ event: 'shutdown', signal }));
		const forced = setTimeout(() => process.exit(0), 5_000);
		forced.unref();
		void app.close().then(() => process.exit(0));
	};
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
	return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	startAiServer();
}
