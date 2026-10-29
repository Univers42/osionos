/** Suppress live broadcasts for synchronous store writes received from the server. */
let depth = 0;

export function broadcastsSuppressed(): boolean { return depth > 0; }

export function withoutBroadcast<T>(write: () => T): T {
  depth += 1;
  try { return write(); } finally { depth -= 1; }
}
