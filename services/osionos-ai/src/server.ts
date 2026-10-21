import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, cutoffPoller } from './auth.ts';
import { config } from './config.ts';
import { createPool } from './db.ts';
import { readJson, sendError, sendJson, sendPreflight } from './http.ts';
import { canAccessWorkspace } from './workspaceAccess.ts';
import { createConversation, getOwnedConversation, listConversations, listMessages } from './conversations/repo.ts';

/** The UUID shape the bridge's tokens carry (scripts/bridge-session-token.mjs:10). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createConversationSchema = z.object({
	workspaceId: z.string().regex(UUID, 'workspaceId must be a uuid'),
	title: z.string().max(200).optional(),
});

export interface AiServer {
	server: ReturnType<typeof createServer>;
	db: Pool;
	redis: Redis;
	close(): Promise<void>;
}

/** The Redis client of the service: it connects on demand and gives up in a second. */
function createRedisClient(redisUrl: string): Redis {
	const client = new Redis(redisUrl, {
		lazyConnect: true,
		connectTimeout: 1_000,
		commandTimeout: 1_000,
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

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	db: Pool,
	redis: Redis,
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
	const server = createServer((request, response) => {
		void handleRequest(request, response, db, redis);
	});
	return {
		server,
		db,
		redis,
		async close(): Promise<void> {
			cutoffPoller.stop();
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeIdleConnections();
			});
			await db.end();
			try {
				await redis.quit();
			} catch {
				redis.disconnect();
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
