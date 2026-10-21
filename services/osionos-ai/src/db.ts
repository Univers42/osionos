import { Pool } from 'pg';
import type { QueryConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * Anything that can run a statement: the pool, or one of its clients.
 *
 * The related read holds ONE connection for the whole answer, and a request
 * that holds a connection while asking the pool for a second one deadlocks the
 * pool (ten connections, ten requests, and every one of them waiting for the
 * eleventh). The reads of that request are typed as a runner, so the same
 * function serves the pool and a client of the pool.
 */
export interface QueryRunner {
	query<R extends QueryResultRow = any, I = any[]>(
		queryTextOrConfig: string | QueryConfig<I>,
		values?: I,
	): Promise<QueryResult<R>>;
}

/** The message pg's pool says when it had no connection to hand out in time. */
const POOL_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';

/**
 * Whether the failure is the pool's own timeout: the request waited for a
 * connection and got none.
 *
 * It is a 503, not a 500: the service is busy, and the client may come back.
 * The wait for a connection is NOT covered by statement_timeout — that one
 * covers a statement, not the queue of the pool.
 *
 * Caveat: matches the text of pg-pool's error, which has no code. A pg upgrade
 * that rewords it turns these 503s into 500s (a louder failure, never a hidden
 * one); tests/relatedPool.test.ts pins the text.
 */
export function isPoolTimeout(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes(POOL_TIMEOUT_MESSAGE);
}

/**
 * One pool for the service: ten connections, every statement capped at five
 * seconds, and the wait for a connection capped too.
 *
 * @param databaseUrl the database of the service
 * @param max the number of connections the pool hands out
 */
export function createPool(databaseUrl: string, max = 10): Pool {
	const pool = new Pool({
		connectionString: databaseUrl,
		max,
		// The wait for a connection is BOUNDED. Without it, a request that
		// waits for one waits for ever: statement_timeout does not cover the
		// queue of the pool.
		connectionTimeoutMillis: 5_000,
		statement_timeout: 5_000,
		application_name: 'osionos-ai',
	});
	// An idle client that dies must not take the process down with it.
	pool.on('error', (error: Error) => {
		console.warn(JSON.stringify({ event: 'pool_error', code: error.name }));
	});
	return pool;
}
