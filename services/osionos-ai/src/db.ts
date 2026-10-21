import { Pool } from 'pg';

/** One pool for the service: ten connections, every statement capped at five seconds. */
export function createPool(databaseUrl: string): Pool {
	const pool = new Pool({
		connectionString: databaseUrl,
		max: 10,
		statement_timeout: 5_000,
		application_name: 'osionos-ai',
	});
	// An idle client that dies must not take the process down with it.
	pool.on('error', (error: Error) => {
		console.warn(JSON.stringify({ event: 'pool_error', code: error.name }));
	});
	return pool;
}
