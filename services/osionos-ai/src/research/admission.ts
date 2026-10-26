import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { takeDaySeat } from '../images/quota.ts';
import { secondsUntilUtcMidnight } from '../voice/quota.ts';

/**
 * Who may start a research run, decided before a row or a reservation exists
 * (C401, C404). A research run holds a connection for minutes and, on a
 * platform model, spends the platform's money, so it has its own gates:
 *   - busy: one in flight per user (Redis, so replicas agree), two per
 *     instance (process memory);
 *   - quota: 3 a day per user and `researchPlatformDaily` per instance, only
 *     when the platform pays (C404). A user's own provider is theirs to spend.
 * Redis down is a refusal, never a pass.
 *
 * Caveat: the instance count lives in this process, so N replicas allow 2N
 * runs in all, and a crash loses its count (the user's Redis slot expires on
 * its own, after the deadline plus a minute). The daily counters are fixed
 * windows of the UTC day.
 */

export const RESEARCH_USER_PER_DAY = 3;
const INSTANCE_RUNS = 2;
/** The deadline of a run (8 minutes) plus a minute: a slot a crash left behind frees itself. */
const BUSY_TTL_MS = 9 * 60_000;

const busyKey = (userId: string): string => `ai:research:busy:${userId}`;
const quotaUserKey = (userId: string, day: string): string => `ai:rl:research:${userId}:${day}`;
const quotaGlobalKey = (day: string): string => `ai:rl:research:all:${day}`;

/** The runs in flight on this instance. */
const instanceRuns = new Set<string>();

/** 0 busy, 1 taken, 2 this run id already holds the slot (a re-POST). Atomic, so two replicas never both take it. */
const TAKE_SLOT = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZSCORE', KEYS[1], ARGV[3]) then return 2 end
if redis.call('ZCARD', KEYS[1]) >= 1 then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1`;

export type Admission =
	| { kind: 'admitted'; release: () => Promise<void>; refund: () => Promise<void> }
	| { kind: 'refused'; code: 'research_busy' | 'research_quota'; retryAfterSeconds?: number };

const nothing = async (): Promise<void> => undefined;

async function takeSlot(redis: Redis, userId: string, runId: string): Promise<0 | 1 | 2> {
	try {
		const taken = Number(await redis.eval(TAKE_SLOT, 1, busyKey(userId), Date.now(), BUSY_TTL_MS, runId));
		return taken === 1 || taken === 2 ? taken : 0;
	} catch {
		return 0;
	}
}

/** A research run may start: the slot is held until `release`, the day's seat until `refund` gives it back. */
export async function admitResearch(
	redis: Redis,
	input: { userId: string; runId: string; platformPays: boolean },
	now: Date = new Date(),
): Promise<Admission> {
	const { userId, runId } = input;
	// The same run asked again re-attaches to its stream: it holds its slot already.
	if (instanceRuns.has(runId)) return { kind: 'admitted', release: nothing, refund: nothing };
	if (instanceRuns.size >= INSTANCE_RUNS) return { kind: 'refused', code: 'research_busy' };
	// Reserved before the first await: two POSTs of one instance cannot both pass the check.
	instanceRuns.add(runId);
	const dropInstance = () => void instanceRuns.delete(runId);
	const slot = await takeSlot(redis, userId, runId);
	if (slot !== 1) {
		dropInstance();
		return slot === 2
			? { kind: 'admitted', release: nothing, refund: nothing }
			: { kind: 'refused', code: 'research_busy' };
	}
	const release = async (): Promise<void> => {
		dropInstance();
		await redis.zrem(busyKey(userId), runId).catch(() => 0);
	};
	if (!input.platformPays) return { kind: 'admitted', release, refund: nothing };
	try {
		const seat = await takeDaySeat(
			redis,
			userId,
			{ perUser: RESEARCH_USER_PER_DAY, global: config.researchPlatformDaily },
			now,
			{ user: quotaUserKey, global: quotaGlobalKey },
		);
		if (seat.kind === 'taken') return { kind: 'admitted', release, refund: () => seat.giveBack().catch(() => undefined) };
		await release();
		return { kind: 'refused', code: 'research_quota', retryAfterSeconds: seat.retryAfterSeconds };
	} catch {
		await release();
		return { kind: 'refused', code: 'research_quota', retryAfterSeconds: secondsUntilUtcMidnight(now) };
	}
}
