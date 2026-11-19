// The pages whose body a server fetch has answered this session. ADR 0064 PS19
// (F12): an empty body counts as empty only once the server has said so.
//
// Caveat: "answered once" is remembered for the session. A body another device
// fills afterwards still reads as empty here until it reaches this store; the
// starter writes only on a click, through the editor's normal versioned save.

const answered = new Set<string>();
const listeners = new Set<() => void>();

export function markServerCopy(pageId: string): void {
  if (answered.has(pageId)) return;
  answered.add(pageId);
  for (const listener of listeners) listener();
}

export function hasServerCopy(pageId: string): boolean {
  return answered.has(pageId);
}

export function subscribeServerCopies(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
