import { setTimeout as sleep } from 'node:timers/promises';
import type { Redis } from 'ioredis';

/**
 * The queue of the one GPU (devil C75): the image runs of every replica, first
 * come first served, one at a time.
 *
 * A sorted set in Redis, scored by the moment a run joined. The run at rank 0
 * is the one the engine works for; the others look again every POLL_MS. The
 * engine is never called twice at once, whatever the number of replicas.
 *
 * Caveat: a replica that dies at rank 0 blocks the runs behind it until its
 * entry is older than the longest legitimate stay (a full wait plus a full
 * generation) and is pruned; until then they wait, or give up at their own
 * deadline with image_busy. A heartbeat would shorten that; one replica on
 * ai-dev does not need one yet.
 */

export const IMAGE_QUEUE_KEY = 'ai:img:queue';
/** The run the engine works for, and four that wait. */
export const QUEUE_CAPACITY = 5;
/** The longest a run waits for its turn. */
export const QUEUE_WAIT_MS = 120_000;
const POLL_MS = 250;
/** The seconds of one image on the engine: A1 measured 19.1–19.5 s warm. */
export const SECONDS_PER_IMAGE = 20;

/** The busy queue: the run gave up its wait. */
export function queueBusy(): Error {
	return Object.assign(new Error('image_busy'), { code: 'image_busy' });
}

/** The longest an entry can legitimately stay: past it, its run is dead. */
function staleAfterMs(timeoutMs: number): number {
	return QUEUE_WAIT_MS + timeoutMs + 30_000;
}

export type QueueEntry = { joined: true; position: number } | { joined: false; ahead: number };

/**
 * The run joins the queue, or is refused when the queue is full. `position`
 * is the number of runs before it: 0 means the engine is its own.
 */
export async function joinQueue(redis: Redis, runId: string, nowMs: number, timeoutMs: number): Promise<QueueEntry> {
	const staleMs = staleAfterMs(timeoutMs);
	const results = await redis
		.multi()
		.zremrangebyscore(IMAGE_QUEUE_KEY, '-inf', nowMs - staleMs)
		.zadd(IMAGE_QUEUE_KEY, nowMs, runId)
		.zrank(IMAGE_QUEUE_KEY, runId)
		.pexpire(IMAGE_QUEUE_KEY, staleMs)
		.exec();
	const rank = Number(results?.[2]?.[1] ?? 0);
	if (rank >= QUEUE_CAPACITY) {
		await redis.zrem(IMAGE_QUEUE_KEY, runId);
		return { joined: false, ahead: rank };
	}
	return { joined: true, position: rank };
}

/**
 * The wait for the turn of a run. It ends when the run is first; an abort of
 * the signal rejects it, and so does the deadline (image_busy).
 */
export async function waitTurn(
	redis: Redis,
	runId: string,
	{ signal, deadlineMs, timeoutMs }: { signal: AbortSignal; deadlineMs: number; timeoutMs: number },
): Promise<void> {
	for (;;) {
		signal.throwIfAborted();
		const results = await redis
			.multi()
			.zremrangebyscore(IMAGE_QUEUE_KEY, '-inf', Date.now() - staleAfterMs(timeoutMs))
			.zrank(IMAGE_QUEUE_KEY, runId)
			.exec();
		const rank = results?.[1]?.[1];
		if (rank === 0) return;
		// A run that is not in the queue any more was pruned as dead: it
		// waited longer than any run can.
		if (rank === null || rank === undefined || Date.now() >= deadlineMs) throw queueBusy();
		await sleep(POLL_MS, undefined, { signal });
	}
}

/** The run leaves the queue: the next one gets the engine. */
export async function leaveQueue(redis: Redis, runId: string): Promise<void> {
	await redis.zrem(IMAGE_QUEUE_KEY, runId);
}
