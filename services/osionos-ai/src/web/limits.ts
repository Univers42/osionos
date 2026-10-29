import type { Redis } from 'ioredis';
import { checkRateLimit } from '../rateLimit.ts';
import { WebFailure } from './failure.ts';

/**
 * How much of the web one user and one instance may use (web C362-C364).
 *
 * Four bounds, each answering a different abuse:
 *   - per run: 8 searches, 12 fetches (C362), counted by the run itself;
 *   - per user: 30 searches and 60 fetches in ten minutes, in Redis (C363);
 *   - in flight: 2 web calls per user, 8 per instance (C364), in process;
 *   - per day: 50 MiB downloaded per user (C364), in Redis.
 * Redis down is a refusal, never a pass: no outbound request without a count.
 *
 * Caveat: the ten-minute buckets are fixed windows, so up to twice the limit
 * passes around a window boundary; the daily byte count is charged after a
 * fetch, so one fetch can pass the cap by up to its own 2 MiB.
 */
export const RUN_SEARCH_CAP = 8;
export const RUN_FETCH_CAP = 12;
export const USER_IN_FLIGHT = 2;
export const INSTANCE_IN_FLIGHT = 8;
export const DAILY_BYTES = 50 * 1024 * 1024;

const BUCKET_WINDOW_SECONDS = 600;
export const SEARCH_BUCKET = { limit: 30, prefix: 'ai:rl:web-search' } as const;
export const FETCH_BUCKET = { limit: 60, prefix: 'ai:rl:web-fetch' } as const;
const BYTES_PREFIX = 'ai:web-bytes';
/** The day's byte counter outlives its day, so a late write cannot revive it. */
const BYTES_TTL_SECONDS = 172_800;

/** One call against a user's bucket: throws `web_rate_limited` when spent or when Redis cannot say. */
export async function spendBucket(
	redis: Redis,
	userId: string,
	bucket: { limit: number; prefix: string },
	now: Date = new Date(),
): Promise<void> {
	let allowed = false;
	try {
		allowed = (await checkRateLimit(redis, userId, bucket.limit, now, bucket.prefix, BUCKET_WINDOW_SECONDS)).allowed;
	} catch {
		allowed = false;
	}
	if (!allowed) throw new WebFailure('web_rate_limited');
}

function bytesKey(userId: string, now: Date): string {
	return `${BYTES_PREFIX}:${userId}:${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

/** Throws `web_rate_limited` when the user's bytes of the day are spent, or when Redis cannot say. */
export async function checkDailyBytes(redis: Redis, userId: string, now: Date = new Date()): Promise<void> {
	let used = Number.POSITIVE_INFINITY;
	try {
		used = Number((await redis.get(bytesKey(userId, now))) ?? 0);
	} catch {
		used = Number.POSITIVE_INFINITY;
	}
	if (!(used < DAILY_BYTES)) throw new WebFailure('web_rate_limited');
}

/** Adds what a fetch downloaded to the day's count; the counter and its expiry move together. */
export async function chargeDailyBytes(redis: Redis, userId: string, bytes: number, now: Date = new Date()): Promise<void> {
	const key = bytesKey(userId, now);
	await redis.multi().incrby(key, bytes).expire(key, BYTES_TTL_SECONDS, 'NX').exec();
}

/**
 * The web calls in flight on this instance: a slot is taken before the first
 * request and given back in `finally`.
 */
export class InFlight {
	private readonly perUser = new Map<string, number>();
	private total = 0;
	private readonly userCap: number;
	private readonly instanceCap: number;

	constructor(userCap: number = USER_IN_FLIGHT, instanceCap: number = INSTANCE_IN_FLIGHT) {
		this.userCap = userCap;
		this.instanceCap = instanceCap;
	}

	/** A release function, or null when the user or the instance is at its cap. */
	acquire(userId: string): (() => void) | null {
		const mine = this.perUser.get(userId) ?? 0;
		if (mine >= this.userCap || this.total >= this.instanceCap) return null;
		this.perUser.set(userId, mine + 1);
		this.total += 1;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.total -= 1;
			const left = (this.perUser.get(userId) ?? 1) - 1;
			if (left > 0) this.perUser.set(userId, left);
			else this.perUser.delete(userId);
		};
	}
}

/** The slots of this process: every run of the instance shares them. */
export const webInFlight = new InFlight();
