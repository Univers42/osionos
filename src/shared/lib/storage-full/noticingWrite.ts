/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noticingWrite.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

// A localStorage write a full origin refuses never throws into its caller, and the user is told
// once per store per session (ADR 0056 A5). Preferences pass the plain `trySetItem`; user content
// passes a writer that makes room first. The memory state is the caller's and stays as it is.
// Caveat: one notice per store per session. A store refused, then kept, then refused again is
// not shown a second time, and a dismissed notice does not come back until the page reloads.

/** Writes `text` under `key`; false when it was not kept. */
export type StorageWriter = (key: string, text: string) => boolean;

const noticedStores = new Set<string>();

/** `setItem` that reports a refusal (quota, blocked or absent storage) as false instead of throwing. */
export function trySetItem(key: string, text: string, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

function noticeStorageFull(store: string): void {
  if (noticedStores.has(store)) return;
  noticedStores.add(store);
  useToastStore.getState().push({
    kind: "error",
    title: "Browser storage is full",
    description: `${store}: changes can't be kept across a reload. Free browser storage to keep them.`,
  });
}

/** `write` that shows the storage-full notice the first time a write of `store` is refused this
 *  session. Without a localStorage nothing refused the write, so nothing is shown. Never throws. */
export function noticingWriter(store: string, write: StorageWriter = trySetItem): StorageWriter {
  return (key, text) => {
    if (write(key, text)) return true;
    if (globalThis.localStorage) noticeStorageFull(store);
    return false;
  };
}

function readItem(name: string): string | null {
  try {
    return globalThis.localStorage?.getItem(name) ?? null;
  } catch {
    return null;
  }
}

/** The zustand `persist` storage over localStorage whose writes go through `noticingWriter`. */
export function noticingJsonStorage<S>(store: string, write: StorageWriter = trySetItem) {
  const writeNoticing = noticingWriter(store, write);
  const state: StateStorage = {
    getItem: readItem,
    setItem: (name, value) => void writeNoticing(name, value),
    removeItem: (name) => {
      try { globalThis.localStorage?.removeItem(name); } catch { /* nothing to remove */ }
    },
  };
  return createJSONStorage<S>(() => state);
}
