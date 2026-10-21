import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { cutoffPoller } from './auth.ts';
import { config } from './config.ts';
import { createPool } from './db.ts';
import { sendError, sendPreflight } from './http.ts';
import { handleHealth } from './routes/health.ts';
import { handleConversationMessages, handleConversations } from './routes/conversations.ts';
import { handleModels } from './routes/models.ts';
import { handleRunCancel, handleRunEvents, handleRuns } from './routes/runs.ts';
import { sweepStaleRuns } from './runs/runner.ts';
import * as runStore from './runs/runStore.ts';
import type { RouteEntry, RouteHandler } from './routes/types.ts';

/**
 * The service: the bootstrap, the dispatch table, and the shutdown.
 *
 * The routes live in src/routes, one file per group; the table below is the
 * only thing that knows which path answers what.
 */

/** The sweep of the stale runs: once a minute. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * The dispatch table.
 *
 * The first entry whose pattern matches the path AND whose methods carry the
 * request's method answers. A path that matches with another method is a 404,
 * except for the routes that say otherwise.
 */
const ROUTES: RouteEntry[] = [
	{ methods: ['GET'], pattern: /^\/api\/ai\/health$/, label: '/api/ai/health', handle: handleHealth },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/conversations\/([^/]+)\/messages$/,
		label: '/api/ai/conversations/:id/messages',
		handle: handleConversationMessages,
	},
	{
		methods: [],
		pattern: /^\/api\/ai\/conversations$/,
		label: '/api/ai/conversations',
		handle: handleConversations,
		anyMethod: true,
	},
	{ methods: ['GET'], pattern: /^\/api\/ai\/models$/, label: '/api/ai/models', handle: handleModels },
	{ methods: ['POST'], pattern: /^\/api\/ai\/runs$/, label: '/api/ai/runs', handle: handleRuns },
	{
		methods: ['GET'],
		pattern: /^\/api\/ai\/runs\/([^/]+)\/events$/,
		label: '/api/ai/runs/:id/events',
		handle: handleRunEvents,
	},
	{
		methods: ['POST'],
		pattern: /^\/api\/ai\/runs\/([^/]+)\/cancel$/,
		label: '/api/ai/runs/:id/cancel',
		handle: handleRunCancel,
	},
];

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

/**
 * The route that answers the request, and the groups of its path.
 *
 * The first entry whose path matches wins, unless it does not answer the
 * request's method: then the scan goes on, and a path nobody answers is a 404.
 */
function matchRoute(pathname: string, method: string): { entry: RouteEntry; params: string[] } | null {
	for (const entry of ROUTES) {
		const match = entry.pattern.exec(pathname);
		if (!match) continue;
		if (!entry.anyMethod && !entry.methods.includes(method)) continue;
		return { entry, params: match.slice(1) };
	}
	return null;
}

/** The route that answers the request, or null when nothing does. */
async function dispatch(
	request: IncomingMessage,
	response: ServerResponse,
	deps: RequestDeps,
): Promise<{ status: number; route: string }> {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
	const found = matchRoute(url.pathname, request.method ?? '');
	if (!found) {
		sendError(response, 404, 'not_found');
		return { status: 404, route: 'unknown' };
	}
	const handler: RouteHandler = found.entry.handle;
	const status = await handler({ request, response, url, params: found.params, deps });
	return { status, route: found.entry.label };
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	deps: RequestDeps,
): Promise<void> {
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
		const answered = await dispatch(request, response, deps);
		status = answered.status;
		route = answered.route;
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
