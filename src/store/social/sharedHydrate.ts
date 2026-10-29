/* ************************************************************************** */

// Several rows mount useConnections at once and each one calls hydrate(); the
// stores would send one request (and raise one toast) per row. Concurrent calls
// share one in-flight promise instead.
// Caveat: a call that arrives while a request is in flight gets that request's
// result, so a write made after it started is not reflected until the next hydrate.
export function shareInFlight(run: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
