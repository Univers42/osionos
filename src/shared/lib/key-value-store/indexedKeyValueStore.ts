export interface KeyValueStore {
  /**
   * One readwrite transaction: reads `keys`, calls `change` synchronously with what was read, puts
   * every entry of the object `change` returns (null or {} writes nothing). Resolves with the values
   * read, and only when the transaction has completed. Rejects when the transaction errors or aborts,
   * when `change` throws (nothing is written), or when the store is closed.
   */
  update(
    keys: readonly string[],
    change: (current: ReadonlyMap<string, unknown>) => Record<string, unknown> | null,
    options?: { durability?: "default" | "strict" },
  ): Promise<ReadonlyMap<string, unknown>>;
  close(): void;
}

export interface OpenKeyValueStoreOptions {
  factory?: IDBFactory;      // default: globalThis.indexedDB
  openTimeoutMs?: number;    // default: no timeout
}

type Change = Parameters<KeyValueStore["update"]>[1];
type UpdateOptions = Parameters<KeyValueStore["update"]>[2];
type Reject = (reason?: unknown) => void;

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function transactionError(action: string, event: Event, transaction: IDBTransaction): Error {
  const source = event.target as IDBRequest<unknown> | IDBTransaction | null;
  const fallback = action === "aborted" ? "AbortError" : "UnknownError";
  const cause = source?.error ?? transaction.error ?? fallback;
  return new Error(`IndexedDB transaction ${action}: ${describeError(cause)}`);
}

function applyChange(
  transaction: IDBTransaction,
  store: IDBObjectStore,
  current: ReadonlyMap<string, unknown>,
  change: Change,
  reject: Reject,
): void {
  try {
    const changes = change(current);
    for (const [key, value] of Object.entries(changes ?? {})) store.put(value, key);
  } catch (error) {
    reject(error);
    transaction.abort();
  }
}

function runUpdate(
  db: IDBDatabase, keys: readonly string[],
  change: Change, options: UpdateOptions,
): Promise<ReadonlyMap<string, unknown>> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("entries", "readwrite", options);
    const store = transaction.objectStore("entries");
    const current = new Map<string, unknown>();
    let remaining = keys.length;
    transaction.oncomplete = () => resolve(current);
    transaction.onerror = event => reject(transactionError("failed", event, transaction));
    transaction.onabort = event => reject(transactionError("aborted", event, transaction));
    const apply = () => applyChange(transaction, store, current, change, reject);
    if (remaining === 0) { apply(); return; }
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result !== undefined) current.set(key, request.result);
        remaining -= 1;
        if (remaining === 0) apply();
      };
    }
  });
}

function createStore(db: IDBDatabase): KeyValueStore {
  let closed = false;
  const close = () => { closed = true; db.close(); };
  // Closing cooperatively lets another tab finish its upgrade or deletion.
  db.onversionchange = () => close();
  return {
    close,
    update(keys, change, options) {
      if (closed) return Promise.reject(new Error("IndexedDB key-value store is closed"));
      return runUpdate(db, keys, change, options);
    },
  };
}

function openDatabase(name: string, factory: IDBFactory, timeout?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { settled = true; if (timer !== undefined) clearTimeout(timer); };
    const fail = (error: Error) => { if (!settled) { stop(); reject(error); } };
    request.onupgradeneeded = () => { request.result.createObjectStore("entries"); };
    request.onerror = () => fail(new Error(`IndexedDB open failed for "${name}": ${describeError(request.error)}`));
    request.onblocked = () => fail(new Error(`IndexedDB open blocked for "${name}"`));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      stop();
      resolve(request.result);
    };
    if (timeout !== undefined) {
      // An open that never fires would otherwise leave its caller waiting forever.
      // Caveat: a slow disk is reported as unavailable when this timeout expires.
      timer = setTimeout(() => fail(new Error(`IndexedDB open timed out for "${name}" after ${timeout} ms`)), timeout);
    }
  });
}

export function openIndexedKeyValueStore(
  name: string,
  options?: OpenKeyValueStoreOptions,
): Promise<KeyValueStore> {
  const factory = options?.factory ?? globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable: no factory exists"));
  return openDatabase(name, factory, options?.openTimeoutMs).then(createStore);
}
