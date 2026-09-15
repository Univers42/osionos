/**
 * Request hygiene primitives, independent of HTTP.
 *
 * Two distinct concerns that are easy to conflate:
 *   - `createRequestGate` bounds CONCURRENCY — how many tasks run at once.
 *   - `createInflightDedupe` collapses DUPLICATES — identical work in flight
 *     shares one result.
 *
 * Both are generic over the task, so they are reusable for anything awaitable,
 * not just fetch.
 */

/** Bounds how many tasks run concurrently; the rest queue in FIFO order. */
export interface RequestGate {
  /** Run `task` once a slot is free. The slot is released even if it throws. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks currently holding a slot. */
  readonly active: number;
  /** Tasks queued for a slot. */
  readonly waiting: number;
}

/**
 * Bound concurrency to `maxConcurrent`. A caller that needs many resources
 * drains politely instead of firing every request at once (which a rate-limited
 * server answers with 429/502).
 */
export function createRequestGate(maxConcurrent = 6): RequestGate {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError(`maxConcurrent must be a positive integer, got ${maxConcurrent}`);
  }

  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  };

  const release = (): void => {
    const next = waiters.shift();
    // Hand the held slot straight to the next waiter: `active` is unchanged,
    // so a released slot can never be claimed by a newcomer that jumped the
    // queue between the shift and the resume.
    if (next) next();
    else active -= 1;
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return waiters.length;
    },
  };
}

/** Collapses identical in-flight work onto a single shared promise. */
export interface InflightDedupe {
  /** Return the in-flight promise for `key`, else start one and register it. */
  share<T>(key: string, start: () => Promise<T>): Promise<T>;
  /** Number of calls currently in flight. */
  readonly size: number;
}

/**
 * Share one promise per key while it is pending. The entry is dropped when the
 * promise settles — including on rejection, so a failure is never cached.
 */
export function createInflightDedupe(): InflightDedupe {
  const inflight = new Map<string, Promise<unknown>>();

  return {
    share<T>(key: string, start: () => Promise<T>): Promise<T> {
      const shared = inflight.get(key);
      if (shared) return shared as Promise<T>;
      const pending = start().finally(() => inflight.delete(key));
      inflight.set(key, pending);
      return pending;
    },
    get size() {
      return inflight.size;
    },
  };
}
