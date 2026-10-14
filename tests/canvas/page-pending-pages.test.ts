/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-pending-pages.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Live demo origin, 2026-10-14: localStorage at ~2.51M of Chrome's ~2.62M characters, the page
// cache's writes failing silently, and an unconfirmed edit kept nowhere but memory. A storage stub
// with a character quota stands in for the browser's. The cache tests run first: evicting the page
// caches stops this module's cache writes for the rest of the session, as it does in a tab.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { loadLedger } from "@osionos/outbox-ledger";

import type { PageEntry } from "@/entities/page";
import { evictPageCaches, flushScheduledPagesCachePersist, loadPagesCache, PAGE_OUTBOX_KEY, savePagesCache } from "@/store/pageStore.helpers";
import {
  createPendingKeeper,
  createUnloadGuard,
  keepPendingPages,
  PENDING_PAGES_KEY,
  withPendingPages,
} from "@/store/sync/pendingPages";
import { saveOutboxLedger } from "@/store/sync/pageStamp";
import { OUTBOX_RECOVERING_KEY } from "@/store/sync/outboxRecovery";
import { createKnownStateWriter, KNOWN_DATABASE_STATE_STORAGE_KEY } from "@/widgets/database-view/model/knownDatabaseStorage";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

const DATABASES = KNOWN_DATABASE_STATE_STORAGE_KEY;
let store = new Map<string, string>();
let quota = Number.POSITIVE_INFINITY;

const used = (): number => [...store].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
const storage = {
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    const after = used() - (store.has(key) ? key.length + (store.get(key) ?? "").length : 0) + key.length + value.length;
    if (after > quota) throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
    store.set(key, value);
  },
  removeItem: (key: string) => void store.delete(key),
};

const page = (id: string, workspaceId: string, body = id): PageEntry =>
  ({ _id: id, title: id, workspaceId, content: [{ id: `b-${id}`, type: "paragraph", content: body }] }) as PageEntry;

beforeEach(() => {
  store = new Map<string, string>();
  quota = Number.POSITIVE_INFINITY;
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  useToastStore.getState().clear();
});

test("a workspace cache that no longer fits is dropped, not left behind stale", () => {
  store.set("osio:pages:ws1", JSON.stringify([page("p1", "ws1")]));
  quota = used() + 50;
  savePagesCache({ ws1: Array.from({ length: 40 }, (_, index) => page(`p${index}`, "ws1")) }, "ws1");
  flushScheduledPagesCachePersist();
  assert.equal(store.has("osio:pages:ws1"), false);
});

test("on a full origin an unconfirmed page is kept: the page caches go, never the database state or the outbox ledger", () => {
  store.set(DATABASES, "d".repeat(1_400));
  store.set(PAGE_OUTBOX_KEY, JSON.stringify({ p1: "stamp" }));
  store.set("osio:pages:ws1", JSON.stringify(Array.from({ length: 20 }, (_, index) => page(`p${index}`, "ws1"))));
  store.set("osio:pages:ws2", JSON.stringify([page("q1", "ws2")]));
  quota = used() + 20;
  const edited = page("p1", "ws1", "typed while the bridge answered 502");
  assert.equal(keepPendingPages([edited], storage), true);
  assert.equal(store.has("osio:pages:ws1"), false);
  assert.equal(store.has("osio:pages:ws2"), false);
  assert.equal(store.get(DATABASES)?.length, 1_400);
  assert.equal(store.get(PAGE_OUTBOX_KEY), JSON.stringify({ p1: "stamp" }));
  const reloaded = withPendingPages(loadPagesCache(), storage);
  assert.deepEqual(reloaded.ws1, [edited]);
});

test("a kept page replaces its cached copy, and a page known only to the kept set is added", () => {
  const cache = { ws1: [page("p1", "ws1", "old"), page("p2", "ws1")] };
  keepPendingPages([page("p1", "ws1", "new"), page("p3", "ws1")], storage);
  const pages = withPendingPages(cache, storage);
  assert.deepEqual(pages.ws1.map((entry) => entry._id), ["p1", "p2", "p3"]);
  assert.deepEqual(pages.ws1[0], page("p1", "ws1", "new"));
  assert.deepEqual(cache.ws1[0], page("p1", "ws1", "old"), "the cache passed in is not mutated");
});

test("nothing unconfirmed clears the key", () => {
  keepPendingPages([page("p1", "ws1")], storage);
  assert.equal(keepPendingPages([], storage), true);
  assert.equal(store.has(PENDING_PAGES_KEY), false);
});

test("pages that cannot be kept are warned about once, however many flushes try", () => {
  quota = 10;
  let warnings = 0;
  const keep = createPendingKeeper(() => { warnings += 1; }, storage);
  assert.equal(keep([page("p1", "ws1")]), false);
  assert.equal(keep([page("p1", "ws1", "again")]), false);
  assert.equal(warnings, 1);
});

test("the unload guard asks only when the edits could not be kept, and only while armed", () => {
  const target = new EventTarget();
  let keeps = true;
  const guard = createUnloadGuard(target, () => keeps);
  const leave = (): boolean => {
    const event = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  keeps = false;
  assert.equal(leave(), false, "not armed: nothing unconfirmed");
  guard.arm();
  assert.equal(leave(), true, "armed and the edits could not be kept: the browser asks");
  keeps = true;
  assert.equal(leave(), false, "armed but kept: a reload loses nothing");
  keeps = false;
  guard.disarm();
  assert.equal(leave(), false);
});

// devil D6: a refused outbox ledger write left a stale ledger on disk, and every flush reloaded it.
test("the outbox ledger write makes room in the page caches, and the next load is never the stale copy", () => {
  store.set(PAGE_OUTBOX_KEY, JSON.stringify({ p1: "s1" }));
  store.set("osio:pages:ws1", "c".repeat(400));
  quota = used() + 5;
  assert.equal(saveOutboxLedger(PAGE_OUTBOX_KEY, { p1: "s2", p2: "s1" }), true);
  assert.equal(store.has("osio:pages:ws1"), false);
  assert.deepEqual(JSON.parse(store.get(PAGE_OUTBOX_KEY) ?? "{}"), { p1: "s2", p2: "s1" });
  quota = 0;
  assert.equal(saveOutboxLedger(PAGE_OUTBOX_KEY, { p1: "s3" }), false);
  assert.deepEqual(loadLedger(PAGE_OUTBOX_KEY), { p1: "s3" });
});

// devil S1: the recovering marks share the outbox's prefix; without them a refused edit's body is
// taken by a newer server row.
test("eviction keeps every outbox key, and the cache loader reads none of them as a workspace", () => {
  store.set(PAGE_OUTBOX_KEY, JSON.stringify({ p1: "s1" }));
  store.set(OUTBOX_RECOVERING_KEY, JSON.stringify({ r1: "2026-10-14T08:00:00Z" }));
  store.set("osio:pages:ws1", JSON.stringify([page("p1", "ws1")]));
  evictPageCaches(storage);
  assert.deepEqual([...store.keys()].sort(), [PAGE_OUTBOX_KEY, OUTBOX_RECOVERING_KEY].sort());
  assert.deepEqual(Object.keys(loadPagesCache()), []);
});

const storageWarnings = (): number =>
  useToastStore.getState().toasts.filter((toast) => toast.title === "Browser storage is full").length;

// devil D1, at the live origin's numbers: 1.44M of database state, a pending key that fits
// without eviction, then a 5K database edit.
test("a database write that no longer fits makes room in the page caches, never in the outbox", () => {
  store.set(DATABASES, "d".repeat(1_440_000));
  store.set("osio:pages:ws1", "c".repeat(950_000));
  store.set(PAGE_OUTBOX_KEY, "l".repeat(120_000));
  quota = 2_620_000;
  assert.equal(keepPendingPages(Array.from({ length: 5 }, (_, index) => page(`p${index}`, "ws1", "x".repeat(21_200))), storage), true);
  assert.equal(store.has("osio:pages:ws1"), true, "the pending key fitted without eviction");
  const write = createKnownStateWriter(() => {}, storage);
  assert.equal(write("d".repeat(1_445_000)), true);
  assert.equal(store.get(DATABASES)?.length, 1_445_000);
  assert.equal(store.has("osio:pages:ws1"), false);
  assert.equal(store.get(PAGE_OUTBOX_KEY)?.length, 120_000);
  assert.equal(storageWarnings(), 0);
});

test("a database state that still does not fit is warned about once, keeps its older copy and guards the unload", () => {
  const listeners: string[] = [];
  Object.defineProperty(globalThis, "addEventListener", { value: (type: string) => listeners.push(type), configurable: true });
  Object.defineProperty(globalThis, "removeEventListener", { value: () => listeners.pop(), configurable: true });
  store.set(DATABASES, "older");
  quota = used() + 100;
  const write = createKnownStateWriter(() => {}, storage);
  assert.equal(write("d".repeat(1_000)), false);
  assert.equal(write("d".repeat(2_000)), false);
  assert.equal(store.get(DATABASES), "older");
  assert.equal(storageWarnings(), 1);
  assert.deepEqual(listeners, ["beforeunload"], "the browser asks before the tab is left");
  quota = Number.POSITIVE_INFINITY;
  assert.equal(write("d".repeat(3_000)), true);
  assert.deepEqual(listeners, [], "kept: nothing to ask");
});
