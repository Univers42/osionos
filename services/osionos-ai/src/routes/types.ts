import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

/**
 * The shape every route handler sees: the request, the answer, the path and the
 * services it may use.
 */

/** The dependencies of a request: the database, the cache, and the blocking reader. */
export interface RouteDeps {
	db: Pool;
	redis: Redis;
	blockingRedis: Redis;
}

/** Everything a route handler needs. */
export interface RouteContext {
	request: IncomingMessage;
	response: ServerResponse;
	url: URL;
	/** The groups of the matched path, in order. */
	params: string[];
	deps: RouteDeps;
}

/**
 * A route handler answers with the status of the request, so the server can log
 * it. The handler writes the answer itself.
 */
export type RouteHandler = (ctx: RouteContext) => Promise<number>;

/**
 * One entry of the dispatch table of the server.
 *
 * `methods` lists the methods the route answers. A path that matches the
 * pattern but carries another method is a 404 — unless the entry sets
 * `anyMethod`, and the handler decides the method itself.
 */
export interface RouteEntry {
	methods: string[];
	pattern: RegExp;
	/** The name of the route in the log. */
	label: string;
	handle: RouteHandler;
	/** The handler reads the method and answers it, 405 included. */
	anyMethod?: boolean;
}
