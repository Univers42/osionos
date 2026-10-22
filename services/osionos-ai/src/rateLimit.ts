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

/**
 * The key prefixes of the windows.
 *
 * Every limiter of the service is ONE counter and ONE algorithm; the prefix is
 * what tells the windows apart. The runs and the related reads have their own
 * budget, so one of them cannot spend the other's.
 */
export const RUN_LIMIT_PREFIX = 'ai:rl';
export const RELATED_LIMIT_PREFIX = 'ai:rl:related';
export const IMAGE_LIMIT_PREFIX = 'ai:rl:image';

export interface RateLimitResult {
	allowed: boolean;
	/** The seconds until the next minute starts. */
	retryAfterSeconds: number;
}

/** The key of a user's window: one counter per minute, per limiter. */
export function rateLimitKey(userId: string, now: Date, prefix: string = RUN_LIMIT_PREFIX): string {
	const minute = Math.floor(now.getTime() / (WINDOW_SECONDS * 1000));
	return `${prefix}:${userId}:${minute}`;
}

/**
 * One call against the user's window. The counter and its expiry move together,
 * so a burst cannot keep a window alive for ever.
 */
export async function checkRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
	prefix: string = RUN_LIMIT_PREFIX,
): Promise<RateLimitResult> {
	const key = rateLimitKey(userId, now, prefix);
	const results = await redis.multi().incr(key).expire(key, KEY_TTL_SECONDS, 'NX').exec();
	const count = Number(results?.[0]?.[1] ?? 0);
	const seconds = Math.floor(now.getTime() / 1000);
	return {
		allowed: count <= limit,
		retryAfterSeconds: WINDOW_SECONDS - (seconds % WINDOW_SECONDS),
	};
}

/**
 * The window of the runs: the limiter the runs and the approvals spend.
 */
export async function checkRunRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	return checkRateLimit(redis, userId, limit, now, RUN_LIMIT_PREFIX);
}

/**
 * The window of the related reads: the same limiter, its own counter.
 *
 * The related read is a kNN over the vectors of a workspace: it is the most
 * expensive read of the service, and it has its own budget so a client that
 * hammers it cannot spend the budget of the runs.
 */
export async function checkRelatedRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	return checkRateLimit(redis, userId, limit, now, RELATED_LIMIT_PREFIX);
}
