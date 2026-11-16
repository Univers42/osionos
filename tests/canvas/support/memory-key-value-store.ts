import type { KeyValueStore } from "../../../src/shared/lib/key-value-store/indexedKeyValueStore.ts";

export interface MemoryKeyValueStore extends KeyValueStore {
  readonly entries: Map<string, unknown>;
  delayMs: number;
  failWrites: boolean;
  readonly writes: number;
}

type Change = (current: ReadonlyMap<string, unknown>) => Record<string, unknown> | null;

async function performUpdate(
  store: MemoryKeyValueStore,
  keys: readonly string[],
  change: Change,
  countWrite: () => void,
): Promise<ReadonlyMap<string, unknown>> {
  await new Promise<void>(resolve => setTimeout(resolve, store.delayMs));
  const current = new Map<string, unknown>();
  for (const key of keys) {
    if (store.entries.has(key)) current.set(key, store.entries.get(key));
  }
  const changes = Object.entries(change(current) ?? {});
  if (changes.length > 0 && store.failWrites) throw new Error("Memory key-value store write failed");
  // Values are stored as given, without the structured cloning IndexedDB performs.
  for (const [key, value] of changes) store.entries.set(key, value);
  if (changes.length > 0) countWrite();
  return current;
}

export function createMemoryKeyValueStore(initial: Record<string, unknown> = {}): MemoryKeyValueStore {
  const entries = new Map<string, unknown>(Object.entries(initial));
  let closed = false;
  let writes = 0;
  let queue: Promise<void> = Promise.resolve();
  const store: MemoryKeyValueStore = {
    entries,
    delayMs: 0,
    failWrites: false,
    get writes() { return writes; },
    update(keys, change) {
      if (closed) return Promise.reject(new Error("Memory key-value store is closed"));
      const result = queue.then(() => performUpdate(store, keys, change, () => { writes += 1; }));
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    close() { closed = true; },
  };
  return store;
}
