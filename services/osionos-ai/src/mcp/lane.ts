/**
 * The lane of the remote MCP calls: a bound on how many tool runs are in
 * flight at once, and on how many wait for a turn (C118).
 *
 * Search and graph calls embed their query on the TEI query lane, whose p95
 * degrades under contention and hurts the in-app users. The run loop has no
 * such bound (its tools are called by one model, one step at a time); an
 * outside agent can fire in parallel, so it gets one.
 *
 * Caveat: the bound is per process. N replicas allow N times as many calls in
 * flight, and the per-token rate limit (Redis, shared) is what bounds the
 * total. A call that finds the queue full is refused at once, never delayed.
 */

/** The tool runs in flight at once, per process. */
export const MCP_LANE_WIDTH = 4;

/** The calls that may wait for a turn, per process. */
export const MCP_LANE_QUEUE = 16;

/** A lane: `run` waits for a turn, or returns null when the queue is full. */
export interface Lane {
	run<T>(work: () => Promise<T>): Promise<T | null>;
}

export function createLane(width: number = MCP_LANE_WIDTH, queue: number = MCP_LANE_QUEUE): Lane {
	let active = 0;
	const waiting: (() => void)[] = [];
	return {
		async run<T>(work: () => Promise<T>): Promise<T | null> {
			if (active >= width) {
				if (waiting.length >= queue) return null;
				await new Promise<void>((resolve) => waiting.push(resolve));
			} else {
				active += 1;
			}
			try {
				return await work();
			} finally {
				// The turn passes to the next in line without leaving the lane.
				const next = waiting.shift();
				if (next) next();
				else active -= 1;
			}
		},
	};
}

/** The one lane of this process. */
export const mcpLane: Lane = createLane();
