import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { config } from '../config.ts';
import { checkRateLimit } from '../rateLimit.ts';

/**
 * Auto mode's own limits (AM5, AM6): a rate bucket apart from the runs', a cap
 * per UTC day, a cap per turn and a cap per step. Pure helpers; the auto-decide
 * path spends them.
 *
 * Caveat: the daily key uses the UTC date, so a user's "day" resets at UTC
 * midnight, not at local midnight.
 */

/** Its own prefix: a burst of auto writes must not spend the runs' window. */
export const AUTO_WRITE_LIMIT_PREFIX = 'ai:rl:auto';
const DAY_KEY_TTL_SECONDS = 26 * 3600;

export async function checkAutoWriteRate(
	redis: Redis,
	userId: string,
	now: Date = new Date(),
): Promise<{ allowed: boolean }> {
	const { allowed } = await checkRateLimit(redis, userId, config.autoPerMinute, now, AUTO_WRITE_LIMIT_PREFIX);
	return { allowed };
}

/** One auto write against the user's UTC day; the counter and its expiry move together. */
export async function takeDailyAuto(
	redis: Redis,
	userId: string,
	now: Date = new Date(),
): Promise<{ allowed: boolean }> {
	const day = now.toISOString().slice(0, 10).replace(/-/g, '');
	const key = `${AUTO_WRITE_LIMIT_PREFIX}:day:${userId}:${day}`;
	const results = await redis.multi().incr(key).expire(key, DAY_KEY_TTL_SECONDS, 'NX').exec();
	return { allowed: Number(results?.[0]?.[1] ?? 0) <= config.autoPerDay };
}

/**
 * The auto decisions of a turn. A parent run and its `decided` continuation
 * share the turn_id, so the join spans both.
 */
export async function countAutoInTurn(db: Pool, turnId: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		`select count(*)::text as count
		   from public.ai_approvals a join public.ai_runs r on r.id = a.run_id
		  where r.turn_id = $1 and a.decided_by like 'auto:%'`,
		[turnId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

export interface StepCounter {
	reset(): void;
	take(): boolean;
}

export function makeStepCounter(limit: number): StepCounter {
	let taken = 0;
	return {
		reset: () => {
			taken = 0;
		},
		take: () => {
			taken += 1;
			return taken <= limit;
		},
	};
}
