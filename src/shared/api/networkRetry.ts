/**
 * Sends a read again when the network dropped it.
 *
 * A browser that loses an HTTP/2 session (the path to the server stalled for a few seconds) fails
 * every request in flight on it at once with a TypeError. A GET or HEAD has no side effect, so it
 * is sent again on a fresh connection after a short wait; a write is never repeated, because it
 * may have reached the server before the session died.
 *
 * Caveat: a TypeError is also what a CORS refusal or a blocked mixed-content request throws, so a
 * read the browser will never allow is sent 1 + delays.length times and fails about 1.3 s later
 * than it would have. A path down longer than the delays still fails, as before.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Wait = (ms: number) => Promise<void>;

const READ_DELAYS_MS = [300, 1000];

const sleep: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRead = (init?: RequestInit) => ["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase());

/** `inner`, with each read the network dropped sent again after each of `delays` in turn. */
export function networkRetryFetch(inner: FetchLike, delays: number[] = READ_DELAYS_MS, wait: Wait = sleep): FetchLike {
  return async (input, init) => {
    for (const delay of delays) {
      try {
        return await inner(input, init);
      } catch (error) {
        if (!(error instanceof TypeError) || !isRead(init)) throw error;
        await wait(delay);
        if (init?.signal?.aborted) throw error;
      }
    }
    return inner(input, init);
  };
}
