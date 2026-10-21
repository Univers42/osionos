import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { sendJson } from '../http.ts';
import type { RouteContext } from './types.ts';

/**
 * The health of the service: the database and the cache, each on its own.
 */

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

/** GET /api/ai/health — the only route that needs no token. */
export async function handleHealth(ctx: RouteContext): Promise<number> {
	const [database, cache] = await Promise.all([checkDatabase(ctx.deps.db), checkRedis(ctx.deps.redis)]);
	const status = 200;
	sendJson(ctx.response, status, { ok: database === 'ok' && cache === 'ok', db: database, redis: cache });
	return status;
}
