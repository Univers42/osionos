import type { Redis } from 'ioredis';

/**
 * The rate limit of the runs: a fixed window of one minute per user.
 *
 * Caveat: a fixed window lets through up to twice the limit around a boundary
 * (the last second of one minute and the first of the next). A sliding window
 * would not, at the price of a sorted set per user; the run budget is the second
 * line of defence anyway.
 */

const WINDOW_SECONDS = 60;
/** The key outlives the window by ten seconds, so a late write cannot revive it. */
const KEY_TTL_SECONDS = 70;

export interface RateLimitResult {
	allowed: boolean;
	/** The seconds until the next minute starts. */
	retryAfterSeconds: number;
}

/** The key of a user's window: one counter per minute. */
export function rateLimitKey(userId: string, now: Date): string {
	const minute = Math.floor(now.getTime() / (WINDOW_SECONDS * 1000));
	return `ai:rl:${userId}:${minute}`;
}

/**
 * One run against the user's window. The counter and its expiry move together,
 * so a burst cannot keep a window alive for ever.
 */
export async function checkRunRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	const key = rateLimitKey(userId, now);
	const results = await redis.multi().incr(key).expire(key, KEY_TTL_SECONDS, 'NX').exec();
	const count = Number(results?.[0]?.[1] ?? 0);
	const seconds = Math.floor(now.getTime() / 1000);
	return {
		allowed: count <= limit,
		retryAfterSeconds: WINDOW_SECONDS - (seconds % WINDOW_SECONDS),
	};
}
