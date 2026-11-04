import { createHash, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { apiCallOf, classifyFailure } from './failover.ts';
import { isFreeTierModel, quotaSignal, spendsSharedQuota } from './quota.ts';
import type { QuotaSignal } from './quota.ts';

/**
 * A model that keeps failing rests for a while (devil C256-C259).
 *
 * A rest is a Redis key with a TTL (the shared Redis is volatile-lru, so a key
 * without one could be evicted at random). The value is the end of the rest in
 * epoch milliseconds.
 *
 * Who a rest binds: a model of the platform rests for EVERYONE only when the
 * upstream said so (a 429 with Retry-After) or when at least three failures
 * from two distinct users landed within 30 s. Anything else rests the model for
 * the one user whose run failed, so a single pathological prompt cannot take
 * the platform model away from the others. A model of a user's own connection
 * rests only for its owner.
 *
 * Above the routes sits one rest of the ACCOUNT: the free quota is the platform
 * key's, so a limit of the account closes every free route for everyone
 * (src/runs/quota.ts). It is the one rest a run does not try through.
 *
 * Caveat: the corroboration is a count over a sliding window, not proof. Two
 * users who both send a bad prompt can rest a platform model for 60 s
 * (over-resting is bounded by the TTL; under-resting costs one failed attempt
 * per run, as before). A Redis outage reads as "nothing rests": a run always
 * tries its targets.
 */

export const DEFAULT_REST_SECONDS = 60;
export const MAX_REST_SECONDS = 300;
const WINDOW_MS = 30_000;
const MIN_FAILURES = 3;
const MIN_USERS = 2;

/** `Retry-After` as an HTTP date: the only date form servers send. */
const IMF_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** The key of a rest. The tuple is hashed: a model id may hold `:`, so `a|b:c` and `a:b|c` must differ. */
/** One key: the platform has one OpenRouter account. */
export const ACCOUNT_REST_KEY = 'ai:cooldown:account:platform';
const ACCOUNT_TALLY_KEY = 'ai:cooldown:tally:account:platform';

/** Atomic: of two runs that write at once, the longer rest wins, whatever the order. */
const EXTEND_REST = `
local current = tonumber(redis.call('get', KEYS[1]) or '0') or 0
if current < tonumber(ARGV[1]) then
	redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2])
end
return 1`;

export function cooldownKey(scope: 'platform' | `user:${string}`, connectionId: string, model: string): string {
	const digest = createHash('sha256').update(JSON.stringify([connectionId, model])).digest('hex');
	return `ai:cooldown:${scope}:${digest}`;
}

/** The seconds a `Retry-After` asks for, or undefined when it is not a positive integer or a future HTTP date. */
export function retryAfterSeconds(value: string | undefined, nowMs: number): number | undefined {
	const text = value?.trim();
	if (!text) return undefined;
	if (/^\d+$/.test(text)) {
		const seconds = Number(text);
		return seconds > 0 ? seconds : undefined;
	}
	if (!IMF_DATE.test(text)) return undefined;
	const at = Date.parse(text);
	if (Number.isNaN(at)) return undefined;
	const seconds = Math.ceil((at - nowMs) / 1000);
	return seconds > 0 ? seconds : undefined;
}

/**
 * The seconds until `X-RateLimit-Reset`, or undefined when it is not a future
 * epoch in milliseconds.
 *
 * Caveat: the docs do not state the unit; milliseconds come from third-party
 * reports. A value in seconds reads as the past, and the rest falls to the default.
 */
export function resetSeconds(value: string | undefined, nowMs: number): number | undefined {
	if (!value || !/^\d+$/.test(value.trim())) return undefined;
	const seconds = Math.ceil((Number(value) - nowMs) / 1000);
	return seconds > 0 ? seconds : undefined;
}

/** The seconds a rest lasts: the upstream's ask, capped; else the default. */
export function restSeconds(asked: number | undefined): number {
	return asked === undefined ? DEFAULT_REST_SECONDS : Math.min(asked, MAX_REST_SECONDS);
}

export function headerOf(headers: Record<string, string> | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return value;
	return undefined;
}

export interface FailureInput {
	target: Pick<ResolvedTarget, 'connectionId' | 'modelId' | 'platformBudget'>;
	userId: string;
	error: unknown;
	/** The attempt was cancelled or ran out of its own clock: the model's health is not in question. */
	attemptAborted: boolean;
	nowMs?: number;
}

/** Which key a failure wrote, for the tests and the logs. */
export type RestScope = 'account' | 'platform' | 'user' | null;

async function corroborated(redis: Redis, tally: string, input: FailureInput, nowMs: number): Promise<boolean> {
	const replies = await redis
		.multi()
		.zadd(tally, String(nowMs), `${input.userId}|${randomUUID()}`)
		.zremrangebyscore(tally, '0', String(nowMs - WINDOW_MS))
		.zrange(tally, '0', '-1')
		.pexpire(tally, WINDOW_MS * 2)
		.exec();
	const members = (replies?.[2]?.[1] ?? []) as string[];
	const users = new Set(members.map((member) => member.slice(0, member.lastIndexOf('|'))));
	return members.length >= MIN_FAILURES && users.size >= MIN_USERS;
}

function platformCorroborated(redis: Redis, input: FailureInput, nowMs: number): Promise<boolean> {
	const { connectionId, modelId } = input.target;
	return corroborated(redis, cooldownKey('platform', connectionId, modelId).replace('ai:cooldown:', 'ai:cooldown:tally:'), input, nowMs);
}

function writeRest(redis: Redis, key: string, seconds: number, nowMs: number): Promise<unknown> {
	return redis.eval(EXTEND_REST, 1, key, nowMs + seconds * 1000, seconds * 1000);
}

/** Closes the shared quota. Names only in the log: the body of a provider stays out. */
async function restAccount(redis: Redis, input: FailureInput, signal: QuotaSignal, nowMs: number): Promise<RestScope> {
	const headers = apiCallOf(input.error)?.responseHeaders;
	const asked = retryAfterSeconds(headerOf(headers, 'retry-after'), nowMs) ?? resetSeconds(headerOf(headers, 'x-ratelimit-reset'), nowMs);
	await writeRest(redis, ACCOUNT_REST_KEY, restSeconds(asked), nowMs);
	console.warn(JSON.stringify({ event: 'account_rest', kind: signal.kind, status: signal.status, headers: signal.headers, marker: signal.marker ?? null }));
	return 'account';
}

/**
 * Rests the model of a failed attempt, when the failure says the MODEL is busy
 * or down (the same allowlist the failover uses, devil C256).
 */
export async function recordFailure(redis: Redis, input: FailureInput): Promise<RestScope> {
	const nowMs = input.nowMs ?? Date.now();
	if (input.attemptAborted) return null;
	const { target, userId } = input;
	// Before the allowlist: a 402 moves no run, and it still closes the account.
	const signal = spendsSharedQuota(target) ? quotaSignal(input.error) : null;
	try {
		if (signal?.kind === 'account') return await restAccount(redis, input, signal, nowMs);
		if (signal?.kind === 'ambiguous' && (await corroborated(redis, ACCOUNT_TALLY_KEY, input, nowMs))) {
			return await restAccount(redis, input, signal, nowMs);
		}
	} catch {
		return null;
	}
	if (!classifyFailure(input.error)) return null;
	const call = apiCallOf(input.error);
	const asked = retryAfterSeconds(headerOf(call?.responseHeaders, 'retry-after'), nowMs);
	const seconds = restSeconds(asked);
	const write = (scope: 'platform' | `user:${string}`) =>
		writeRest(redis, cooldownKey(scope, target.connectionId, target.modelId), seconds, nowMs);
	try {
		if (!target.platformBudget) {
			await write(`user:${userId}`);
			return 'user';
		}
		const upstreamSaid = call?.statusCode === 429 && asked !== undefined;
		if (upstreamSaid || (await platformCorroborated(redis, input, nowMs))) {
			await write('platform');
			return 'platform';
		}
		await write(`user:${userId}`);
		return 'user';
	} catch {
		return null;
	}
}

export interface RestCandidate {
	connectionId: string;
	model: string;
	/** A platform model also rests for everyone. */
	platform: boolean;
}

/** The seconds left of the account's rest; a Redis outage reads as no rest. */
export async function accountRestSeconds(redis: Redis, nowMs = Date.now()): Promise<number | undefined> {
	try {
		const end = Number(await redis.get(ACCOUNT_REST_KEY));
		return end > nowMs ? Math.ceil((end - nowMs) / 1000) : undefined;
	} catch {
		return undefined;
	}
}

/** The seconds to wait, when every target is on the shared quota and it is closed. */
export async function quotaClosedSeconds(
	redis: Redis,
	targets: readonly Pick<ResolvedTarget, 'modelId' | 'platformBudget'>[],
): Promise<number | undefined> {
	return targets.every(spendsSharedQuota) ? accountRestSeconds(redis) : undefined;
}

/**
 * When each candidate stops resting for this caller (epoch ms), or undefined
 * when it does not rest. ONE MGET for the whole list.
 */
export async function restingUntil(
	redis: Redis,
	userId: string,
	candidates: readonly RestCandidate[],
	nowMs = Date.now(),
): Promise<(number | undefined)[]> {
	if (candidates.length === 0) return [];
	const keys = candidates.flatMap((one) => [
		cooldownKey(`user:${userId}`, one.connectionId, one.model),
		...(one.platform ? [cooldownKey('platform', one.connectionId, one.model)] : []),
	]);
	try {
		const [account, ...values] = await redis.mget(ACCOUNT_REST_KEY, ...keys);
		let cursor = 0;
		return candidates.map((one) => {
			const count = one.platform ? 2 : 1;
			const shared = one.platform && isFreeTierModel(one.model) ? [account] : [];
			const ends = [...values.slice(cursor, cursor + count), ...shared].map(Number).filter((end) => end > nowMs);
			cursor += count;
			return ends.length > 0 ? Math.max(...ends) : undefined;
		});
	} catch {
		return candidates.map(() => undefined);
	}
}

/**
 * Drops a resting target while a LATER one is ready. When every target rests,
 * all stay in order, so a run never fails without trying.
 */
export function skipResting<T>(steps: readonly T[], resting: readonly boolean[]): T[] {
	const lastReady = resting.lastIndexOf(false);
	if (lastReady < 0) return [...steps];
	return steps.filter((_, index) => !resting[index] || index > lastReady);
}

/**
 * The chain without the targets that rest, one MGET for the run. While the
 * account rests, a free route stays only if nothing else is left (a run that
 * passed the refusal: an image dropped its other routes, or a continuation).
 */
export async function orderByRest<T extends { target: ResolvedTarget }>(
	redis: Redis,
	userId: string,
	steps: readonly T[],
): Promise<T[]> {
	const until = await restingUntil(
		redis,
		userId,
		steps.map(({ target }) => ({ connectionId: target.connectionId, model: target.modelId, platform: target.platformBudget })),
	);
	const ordered = skipResting(steps, until.map((end) => end !== undefined));
	if ((await accountRestSeconds(redis)) === undefined) return ordered;
	const open = ordered.filter(({ target }) => !spendsSharedQuota(target));
	return open.length > 0 ? open : ordered;
}
