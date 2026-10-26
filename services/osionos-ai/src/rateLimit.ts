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
export const SOURCES_LIMIT_PREFIX = 'ai:rl:sources';
export const IMAGE_LIMIT_PREFIX = 'ai:rl:image';
export const DESCRIBE_LIMIT_PREFIX = 'ai:rl:describe';
/** The window of the mints: a PAT is minted from a fresh session, and rarely. */
export const PAT_LIMIT_PREFIX = 'ai:rl:pat';
/** The discoveries of MCP servers: each one is an outbound call to a host the user chose (C289). */
export const MCP_DISCOVER_LIMIT_PREFIX = 'ai:rl:mcp-discover';
/** The day bucket of the builder passes (C161). */
export const BUILD_LIMIT_PREFIX = 'ai:rl:build';

/** How long the day bucket outlives its day, in seconds. */
const BUILD_KEY_TTL_SECONDS = 172_800;

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

/**
 * The window of the device-run sources: the same limiter, its own counter.
 *
 * The sources are the chunks a device run would have quoted, served on the
 * run's own access path: a client that searches cannot spend the budget of
 * the runs or of the related reads.
 */
export async function checkSourcesRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	return checkRateLimit(redis, userId, limit, now, SOURCES_LIMIT_PREFIX);
}

/**
 * The window of the mints: the limiter the personal access tokens spend.
 *
 * A mint is a credential that outlives the session that made it, so it gets
 * its own counter: a burst of mints never spends the budget of the runs.
 */
export async function checkPatRateLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	return checkRateLimit(redis, userId, limit, now, PAT_LIMIT_PREFIX);
}

/** The key of a user's build day: one counter per UTC day. */
export function dailyBuildKey(userId: string, now: Date): string {
	const day = now.toISOString().slice(0, 10).replace(/-/g, '');
	return `${BUILD_LIMIT_PREFIX}:${userId}:${day}`;
}

/**
 * The builder passes of a UTC day (C161): a fixed counter per user and day.
 *
 * The counter and its two-day expiry move together in one MULTI, so a burst
 * cannot keep a day's bucket alive for ever. A resume spends it too: it is a
 * build pass.
 */
export async function checkDailyBuildLimit(
	redis: Redis,
	userId: string,
	limit: number,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	const key = dailyBuildKey(userId, now);
	const results = await redis.multi().incr(key).expire(key, BUILD_KEY_TTL_SECONDS, 'NX').exec();
	const count = Number(results?.[0]?.[1] ?? 0);
	const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	return {
		allowed: count <= limit,
		retryAfterSeconds: Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000)),
	};
}

/** The windows of the remote MCP calls: one per token, one per user (C118). */
export const MCP_TOKEN_LIMIT_PREFIX = 'ai:rl:mcp:token';
export const MCP_USER_LIMIT_PREFIX = 'ai:rl:mcp:user';
/** The window of the MCP WRITE proposals: one per token (G4b-2). */
export const MCP_WRITE_LIMIT_PREFIX = 'ai:rl:mcp:write';
export const MCP_CALLS_PER_TOKEN_MINUTE = 60;
export const MCP_CALLS_PER_USER_MINUTE = 120;

/**
 * One MCP call against both windows: the token's and its owner's.
 *
 * Keyed on ids, never on the IP: behind a shared front address one agent
 * would otherwise spend everybody's budget. The user window is what stops a
 * user from multiplying their budget by minting tokens. The token window is
 * spent first, so a refused call does not spend the user's.
 */
export async function checkMcpRateLimit(
	redis: Redis,
	tokenId: string,
	userId: string,
	now: Date = new Date(),
): Promise<RateLimitResult> {
	const token = await checkRateLimit(redis, tokenId, MCP_CALLS_PER_TOKEN_MINUTE, now, MCP_TOKEN_LIMIT_PREFIX);
	if (!token.allowed) return token;
	return checkRateLimit(redis, userId, MCP_CALLS_PER_USER_MINUTE, now, MCP_USER_LIMIT_PREFIX);
}
