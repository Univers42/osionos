/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memory-indexed-db.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A browser whose IndexedDB answers from memory, so the known-database store module runs its real
// durable copy (openKnownDatabaseDurableCopy) at evaluation. Import memory-local-storage.ts first.
// Caveat: it models only what indexedKeyValueStore.ts calls (one object store, get, put, abort,
// oncomplete); no versioning, blocking, quota or cross-connection ordering, so it proves the
// module's wiring, never IndexedDB's behaviour.

import { installBrowserWindow } from "./refusing-indexed-db.ts";

type Handler = ((event: { target: unknown }) => void) | null;
type Request = { result?: unknown; error: null; onsuccess: Handler; onerror: Handler; onupgradeneeded: Handler; onblocked: Handler };

function transaction(entries: Map<string, unknown>) {
  const puts = new Map<string, unknown>();
  const tx = { error: null, aborted: false, oncomplete: null as Handler, onerror: null as Handler, onabort: null as Handler,
    abort: () => { tx.aborted = true; },
    objectStore: () => ({
      get: (key: string) => {
        const request: { result?: unknown; onsuccess: Handler } = { onsuccess: null };
        queueMicrotask(() => { request.result = structuredClone(entries.get(key)); request.onsuccess?.({ target: request }); });
        return request;
      },
      put: (value: unknown, key: string) => { puts.set(key, structuredClone(value)); },
    }),
  };
  // A timer runs after every microtask, so the gets and the callback's puts precede the commit.
  setTimeout(() => {
    if (tx.aborted) { tx.onabort?.({ target: tx }); return; }
    for (const [key, value] of puts) entries.set(key, value);
    tx.oncomplete?.({ target: tx });
  }, 0);
  return tx;
}

/** Installs the browser; the returned map holds each database's entries by database name. */
export function installMemoryIndexedDbBrowser(): Map<string, Map<string, unknown>> {
  const databases = new Map<string, Map<string, unknown>>();
  const open = (name: string) => {
    const request: Request = { error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    const isNew = !databases.has(name);
    const entries = databases.get(name) ?? new Map<string, unknown>();
    databases.set(name, entries);
    request.result = { createObjectStore: () => undefined, close: () => undefined, onversionchange: null, transaction: () => transaction(entries) };
    setTimeout(() => {
      if (isNew) request.onupgradeneeded?.({ target: request });
      request.onsuccess?.({ target: request });
    }, 0);
    return request;
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open } });
  installBrowserWindow();
  return databases;
}
