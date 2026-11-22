import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { takeDaySeat } from '../images/quota.ts';
import { autoChainFor } from '../runs/auto.ts';
import { accountRestSeconds } from '../runs/cooldown.ts';
import { isMayTrain } from '../runs/privacyGate.ts';
import { STALE_RUN_MS } from '../runs/runner.ts';
import { admitThreadRun } from './context.ts';
import type { ThreadLimitScope } from './context.ts';

/**
 * Who may start a thread run, and on what (osio-bot OB8–OB10). A thread run
 * sends other members' words to a model, so it runs only on a no-train
 * platform model, and it spends the ONE shared free account that the private
 * assistant also needs: it refuses ("AI busy") rather than spill.
 */

export interface Refused {
	kind: 'refused';
	status: number;
	code: string;
	retryAfterSeconds?: number;
}

const UNAVAILABLE: Refused = { kind: 'refused', status: 503, code: 'rate_limit_unavailable' };
const LOCK_PREFIX = 'ai:lock:thread-channel:';
/** Under ai:rl: so the test harness clears them with every other bucket. */
const THREAD_DAY_KEYS = {
	user: (userId: string, day: string): string => `ai:rl:thread-day:${userId}:${day}`,
	global: (day: string): string => `ai:rl:thread-day:all:${day}`,
};

function aiBusy(retryAfterSeconds?: number): Refused {
	return { kind: 'refused', status: 429, code: 'ai_busy', ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}

/** Deletes the lock only while it is still this run's: an expired lock may already be another run's. */
const RELEASE_OWN = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

async function releaseChannelLock(redis: Redis, channelId: string, runId: string): Promise<void> {
	try {
		await redis.eval(RELEASE_OWN, 1, `${LOCK_PREFIX}${channelId}`, runId);
	} catch (error) {
		// The TTL frees it; the log names the channel, never the asker.
		console.warn(JSON.stringify({ event: 'thread_lock_release_failed', channelId, error: error instanceof Error ? error.message : String(error) }));
	}
}

/**
 * OB8: at most one bot run in flight per channel.
 *
 * Caveat: the TTL is STALE_RUN_MS (10 min), the point at which the sweep gives
 * a run up, not the run's real end (2 min a call, up to 3 calls). A process
 * that dies before `release` leaves the channel busy until the TTL expires.
 */
export async function acquireChannelLock(
	redis: Redis,
	channelId: string,
	runId: string,
): Promise<{ kind: 'locked'; release: () => Promise<void> } | Refused> {
	try {
		const taken = await redis.set(`${LOCK_PREFIX}${channelId}`, runId, 'PX', STALE_RUN_MS, 'NX');
		if (taken !== 'OK') return { kind: 'refused', status: 429, code: 'channel_busy' };
	} catch {
		return UNAVAILABLE;
	}
	return { kind: 'locked', release: () => releaseChannelLock(redis, channelId, runId) };
}

/**
 * OB10: one member's share of the thread runs of the day, and one count for
 * the whole platform. Both are taken after the four C449 buckets, so a member
 * they refuse spends neither; a member past their share gives the platform
 * seat back in the same call, so one account cannot spend the platform's day.
 *
 * Caveat: both counters move up before either is read (takeDaySeat), so for
 * one round trip a refused member holds a platform seat: a run admitted in
 * that instant at the platform's last seat reads "AI busy". Fixed UTC day:
 * up to twice the caps can run within the hours around midnight.
 */
async function takeThreadDaySeat(redis: Redis, userId: string, now: Date): Promise<{ kind: 'taken'; giveBack: () => Promise<void> } | Refused> {
	const limits = { perUser: config.threadRunsPerUserPerDay, global: config.threadRunsPerDay };
	try {
		const seat = await takeDaySeat(redis, userId, limits, now, THREAD_DAY_KEYS);
		return seat.kind === 'taken' ? seat : aiBusy(seat.retryAfterSeconds);
	} catch {
		return UNAVAILABLE;
	}
}

/** A refund that fails leaves the seat spent until midnight: the run is refused either way. */
async function giveSeatBack(giveBack: () => Promise<void>): Promise<void> {
	try {
		await giveBack();
	} catch (error) {
		console.warn(JSON.stringify({ event: 'thread_seat_refund_failed', error: error instanceof Error ? error.message : String(error) }));
	}
}

export interface Admitted {
	kind: 'admitted';
	release: () => Promise<void>;
	/** Gives the day's seats back: for a run startRun refuses, which never reaches a model. */
	refund: () => Promise<void>;
}

/**
 * The whole admission of a NEW thread run, before startRun: the shared
 * account first (a rest spends no bucket), then the channel lock, then the
 * buckets. A refusal after the lock gives the lock back.
 */
export async function admitThread(
	redis: Redis,
	scope: ThreadLimitScope & { runId: string },
	now: Date = new Date(),
): Promise<Admitted | Refused> {
	const resting = await accountRestSeconds(redis, now.getTime());
	if (resting !== undefined) return aiBusy(resting);
	const lock = await acquireChannelLock(redis, scope.channelId, scope.runId);
	if (lock.kind === 'refused') return lock;
	const buckets = await admitThreadRun(redis, scope, now);
	const seat = buckets.kind === 'refused' ? buckets : await takeThreadDaySeat(redis, scope.userId, now);
	if (seat.kind === 'taken') return { kind: 'admitted', release: lock.release, refund: () => giveSeatBack(seat.giveBack) };
	await lock.release();
	return seat;
}

/**
 * OB9: the Auto chain (no-train, not resting) as the target and its
 * failover, on the platform connection only. An empty chain means every
 * no-train model rests: "AI busy", never the may-train one.
 */
export async function threadTargets(
	db: Pool,
	redis: Redis,
	user: AuthUser,
): Promise<{ kind: 'ok'; target: ResolvedTarget; fallbacks: ResolvedTarget[] } | Refused> {
	const chain = await autoChainFor(redis, user.userId, config.catalog);
	if (chain.length === 0) return aiBusy();
	const targets: ResolvedTarget[] = [];
	for (const entry of chain) {
		const resolved = await resolveTarget(db, redis, user, undefined, entry.menuId);
		if (resolved.kind === 'refused') return resolved;
		// The chain already left may-train out; a target that still reads as one refuses, it never degrades.
		if (isMayTrain(resolved.target) || !resolved.target.platformBudget) return { kind: 'refused', status: 503, code: 'may_train_target' };
		targets.push(resolved.target);
	}
	const [target, ...fallbacks] = targets;
	return { kind: 'ok', target, fallbacks };
}
