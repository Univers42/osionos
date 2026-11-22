import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { checkRateLimit } from '../rateLimit.ts';
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
const PLATFORM_LIMIT_PREFIX = 'ai:rl:thread-platform';
const DAY_SECONDS = 86_400;

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
 * OB10: one count of thread runs a day for the whole platform. It is read
 * after the four C449 buckets, so a member they refuse spends none of it.
 *
 * Caveat: a fixed UTC-day window (INCR + EXPIRE): up to twice the cap can
 * run within the hours around midnight.
 */
async function platformCapRefusal(redis: Redis, now: Date): Promise<Refused | null> {
	try {
		const result = await checkRateLimit(redis, 'all', config.threadRunsPerDay, now, PLATFORM_LIMIT_PREFIX, DAY_SECONDS);
		return result.allowed ? null : aiBusy(result.retryAfterSeconds);
	} catch {
		return UNAVAILABLE;
	}
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
): Promise<{ kind: 'admitted'; release: () => Promise<void> } | Refused> {
	const resting = await accountRestSeconds(redis, now.getTime());
	if (resting !== undefined) return aiBusy(resting);
	const lock = await acquireChannelLock(redis, scope.channelId, scope.runId);
	if (lock.kind === 'refused') return lock;
	const buckets = await admitThreadRun(redis, scope, now);
	const refused = buckets.kind === 'refused' ? buckets : await platformCapRefusal(redis, now);
	if (!refused) return { kind: 'admitted', release: lock.release };
	await lock.release();
	return refused;
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
