import type { Redis } from 'ioredis';

/**
 * The event log of a run: a Redis Stream per run.
 *
 * The stream is the resume point. A client that reconnects with the id of the
 * last event it saw gets exactly the events after it, on any replica, because the
 * stream lives in Redis and not in the process that ran the model.
 *
 * Every key carries a MAXLEN and a TTL: the shared Redis evicts volatile-lru at
 * 384 MB, and a key without a TTL could never be evicted.
 */

/** The prefix of a run's stream. */
export const RUN_STREAM_PREFIX = 'ai:run:';
/** The channel a cancellation travels on. */
export const CANCEL_CHANNEL = 'ai:cancel';
/** A stream keeps its events for fifteen minutes. */
export const RUN_STREAM_TTL_SECONDS = 900;
/** The stream is trimmed to about two thousand events. */
export const RUN_STREAM_MAXLEN = 2000;
/** How long a follower waits for the next event before looking again. */
export const FOLLOW_BLOCK_MS = 15_000;

/** One event of a run, as it sits in the stream. */
export interface StreamEntry {
	id: string;
	type: string;
	data: unknown;
}

/** The types that end a run. */
export const TERMINAL_TYPES = new Set(['done', 'error']);

/** The key of a run's stream. */
export function runKey(runId: string): string {
	return `${RUN_STREAM_PREFIX}${runId}`;
}

/**
 * The event, appended to the stream of the run. The returned id is the id of the
 * SSE frame: the client sends it back as Last-Event-ID to resume.
 */
export async function append(redis: Redis, runId: string, type: string, data: unknown): Promise<string> {
	const key = runKey(runId);
	const results = await redis
		.pipeline()
		.xadd(key, 'MAXLEN', '~', String(RUN_STREAM_MAXLEN), '*', 'type', type, 'data', JSON.stringify(data))
		.expire(key, RUN_STREAM_TTL_SECONDS)
		.exec();
	const first = results?.[0];
	if (!first) throw new Error('stream_append_failed');
	if (first[0]) throw first[0];
	return String(first[1]);
}

/** One entry of a stream, read back from Redis' own shape. */
function parseEntry(entry: [string, string[]]): StreamEntry {
	const fields = entry[1];
	const typeAt = fields.indexOf('type');
	const dataAt = fields.indexOf('data');
	let data: unknown = {};
	if (dataAt >= 0) {
		try {
			data = JSON.parse(fields[dataAt + 1]);
		} catch {
			data = {};
		}
	}
	return { id: entry[0], type: typeAt >= 0 ? fields[typeAt + 1] : 'unknown', data };
}

/**
 * The events of a run after one id, in order. An empty id reads the whole
 * stream: that is the replay of a client that reconnects from the start.
 */
export async function readAfter(redis: Redis, runId: string, afterId: string): Promise<StreamEntry[]> {
	const start = afterId && afterId !== '0-0' ? `(${afterId}` : '-';
	const raw = await redis.xrange(runKey(runId), start, '+');
	return raw.map((entry) => parseEntry(entry as [string, string[]]));
}

/** Compares two stream ids as (ms, seq) pairs: negative when `a` is older. */
function compareIds(a: string, b: string): number {
	const [aMs, aSeq] = a.split('-').map(Number);
	const [bMs, bSeq] = b.split('-').map(Number);
	return aMs - bMs || aSeq - bSeq;
}

/**
 * Whether events between the client's last id and the head of the stream were
 * trimmed away (research C402): the replay would silently start later than
 * the client expects, and a long report needs to say so.
 *
 * Caveat: `entries-added > length` proves a trim happened, and the first
 * entry being newer than the client's id says the client is behind it. A
 * client whose last id is exactly the last trimmed entry lost nothing and is
 * still told (over-reports by one boundary); Redis keeps no id to tell them
 * apart (`max-deleted-entry-id` stays 0-0 after a MAXLEN ~ trim, measured).
 * A Redis older than 7 has no `entries-added`: never reports a gap.
 */
export async function hasGap(redis: Redis, runId: string, afterId: string): Promise<boolean> {
	if (!afterId || afterId === '0-0') return false;
	const flat = (await redis.xinfo('STREAM', runKey(runId))) as unknown[];
	const field = (name: string): unknown => flat[flat.indexOf(name) + 1];
	const added = Number(field('entries-added'));
	const length = Number(field('length'));
	const first = field('first-entry') as [string, unknown] | null | undefined;
	if (!first || !Number.isFinite(added) || added <= length) return false;
	return compareIds(afterId, first[0]) < 0;
}

/**
 * The events of a run after one id, as they arrive. The loop ends on a terminal
 * event (done or error) or when the signal aborts.
 *
 * The blocking read needs its own connection: a blocked Redis client answers
 * nobody else.
 */
export async function follow(
	redis: Redis,
	runId: string,
	afterId: string,
	onEntry: (entry: StreamEntry) => void,
	signal: AbortSignal,
): Promise<void> {
	let cursor = afterId && afterId !== '0-0' ? afterId : '0-0';
	while (!signal.aborted) {
		const response = await redis.xread(
			'COUNT',
			100,
			'BLOCK',
			FOLLOW_BLOCK_MS,
			'STREAMS',
			runKey(runId),
			cursor,
		);
		if (!response) continue;
		for (const [, entries] of response) {
			for (const raw of entries) {
				const entry = parseEntry(raw as [string, string[]]);
				cursor = entry.id;
				onEntry(entry);
				if (TERMINAL_TYPES.has(entry.type)) return;
			}
		}
	}
}

/** Whether the stream of a run is still there: it expires after fifteen minutes. */
export async function exists(redis: Redis, runId: string): Promise<boolean> {
	const count = await redis.exists(runKey(runId));
	return count > 0;
}

/** The cancellation of a run, on the channel every replica listens to. */
export async function publishCancel(redis: Redis, runId: string): Promise<void> {
	await redis.publish(CANCEL_CHANNEL, runId);
}

/**
 * The runs executing in THIS process, by id. The cancel channel reaches them
 * through this map, so a cancellation asked on one replica stops the run
 * wherever it runs.
 */
const runningControllers = new Map<string, AbortController>();

/** The run of this process, from now on cancellable. */
export function trackRun(runId: string, controller: AbortController): void {
	runningControllers.set(runId, controller);
}

/** The run of this process is over: it is not cancellable any more. */
export function releaseRun(runId: string): void {
	runningControllers.delete(runId);
}

/** The abort of a run of this process. False when the run does not run here. */
export function abortRun(runId: string): boolean {
	const controller = runningControllers.get(runId);
	if (!controller || controller.signal.aborted) return false;
	controller.abort();
	return true;
}

/**
 * The one subscriber connection of the process: the cancel channel lands here
 * and reaches the runs of this process.
 */
export async function listenForCancels(subscriber: Redis): Promise<void> {
	subscriber.on('message', (channel: string, message: string) => {
		if (channel !== CANCEL_CHANNEL) return;
		abortRun(message);
	});
	await subscriber.subscribe(CANCEL_CHANNEL);
}
