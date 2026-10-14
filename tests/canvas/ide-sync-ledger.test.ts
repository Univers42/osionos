/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-sync-ledger.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createSyncLedgerStore, configureSyncLedgerStorage, flushSyncLedger,
  SYNC_LEDGER_KEY, MAX_LEDGER_PATHS, MAX_LEDGER_WORKSPACES, type LedgerStorage,
} from "../../src/features/ide/model/syncLedgerPersist.ts";
import {
  recordSyncedHash, clearSyncedHash, syncedHashOf, recordOutboundWrite,
} from "../../src/features/ide/model/ideSyncEngine.ts";
import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { reconcileOnAttach } from "../../src/features/ide/model/reconcileOnAttach.ts";
import { originStorage } from "./fixtures/originStorage.ts";
import { seeded } from "./ide-attach-fixtures.ts";

type FakeStorage = LedgerStorage & { reads: number; writes: number; raw(): string | null };

/** A localStorage stand-in that outlives store instances — the "disk" a reload keeps. */
function fakeStorage(initial: string | null = null, maxChars = Number.POSITIVE_INFINITY): FakeStorage {
  let value = initial;
  const storage: FakeStorage = {
    reads: 0,
    writes: 0,
    getItem(key) {
      storage.reads += 1;
      return key === SYNC_LEDGER_KEY ? value : null;
    },
    setItem(key, next) {
      if (next.length > maxChars) throw new Error("QuotaExceededError");
      storage.writes += 1;
      if (key === SYNC_LEDGER_KEY) value = next;
    },
    raw: () => value,
  };
  return storage;
}

const stored = (storage: FakeStorage): Record<string, Record<string, string>> => JSON.parse(storage.raw() ?? "{}");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("ledger: persists, then rehydrates in a fresh store over the same storage (simulated reload)", () => {
  const disk = fakeStorage();
  const before = createSyncLedgerStore({ storage: disk });
  before.set("ws1", "src/a.c", "h-a");
  before.set("ws1", "b.c", "h-b");
  before.flush();
  assert.deepEqual(stored(disk), { ws1: { "src/a.c": "h-a", "b.c": "h-b" } });

  const after = createSyncLedgerStore({ storage: disk });
  assert.equal(after.get("ws1", "src/a.c"), "h-a");
  assert.equal(after.get("ws1", "b.c"), "h-b");
  assert.equal(after.get("ws2", "src/a.c"), undefined);
});

test("ledger: ideSyncEngine hydrates lazily and persists every record/clear (public API unchanged)", () => {
  const disk = fakeStorage();
  configureSyncLedgerStorage(disk);
  assert.equal(disk.reads, 0, "configuring must not read storage — hydration is lazy");
  recordSyncedHash("wsE", "x.c", "hx");
  recordSyncedHash("wsE", "y.c", "hy");
  clearSyncedHash("wsE", "y.c");
  flushSyncLedger();
  assert.deepEqual(stored(disk), { wsE: { "x.c": "hx" } });

  configureSyncLedgerStorage(disk); // reload: every in-memory entry is gone
  assert.equal(syncedHashOf("wsE", "x.c"), "hx");
  assert.equal(syncedHashOf("wsE", "y.c"), null);
  configureSyncLedgerStorage(null);
});

test("ledger: moveDir re-keys exactly the paths under the dir, and persists", () => {
  const disk = fakeStorage();
  const store = createSyncLedgerStore({ storage: disk });
  store.set("ws1", "Road/Q3.omd", "h-q3");
  store.set("ws1", "Road/deep/x.ts", "h-x");
  store.set("ws1", "Roadmap.omd", "h-sibling");
  store.moveDir("ws1", "Road", "Lane");
  store.flush();
  assert.deepEqual(stored(disk), { ws1: { "Roadmap.omd": "h-sibling", "Lane/Q3.omd": "h-q3", "Lane/deep/x.ts": "h-x" } });
});
test("ledger: corrupted JSON starts empty and is overwritten on the next write", () => {
  const disk = fakeStorage("{not json");
  const store = createSyncLedgerStore({ storage: disk });
  assert.equal(store.get("ws1", "a.c"), undefined);
  store.set("ws1", "a.c", "h");
  store.flush();
  assert.deepEqual(stored(disk), { ws1: { "a.c": "h" } });
});

test("ledger: wrong-shaped JSON keeps only well-formed entries", () => {
  const disk = fakeStorage(JSON.stringify({ ws1: 5, ws2: { "a.c": 7, "b.c": "hb" } }));
  const store = createSyncLedgerStore({ storage: disk });
  assert.equal(store.get("ws1", "a.c"), undefined);
  assert.equal(store.get("ws2", "a.c"), undefined);
  assert.equal(store.get("ws2", "b.c"), "hb");
  assert.equal(createSyncLedgerStore({ storage: fakeStorage("[1,2]") }).get("0", "a"), undefined);
});

test("ledger: at most MAX_LEDGER_PATHS per workspace — the least-recently-written path is evicted", () => {
  const disk = fakeStorage();
  const store = createSyncLedgerStore({ storage: disk });
  for (let i = 0; i < MAX_LEDGER_PATHS; i += 1) store.set("ws", `f${i}.c`, `h${i}`);
  store.set("ws", "f0.c", "h0-again"); // re-written → now the most recent
  store.set("ws", "extra.c", "hx"); // one over the bound → evicts f1.c, not f0.c
  assert.equal(store.get("ws", "f1.c"), undefined);
  assert.equal(store.get("ws", "f0.c"), "h0-again");
  assert.equal(store.get("ws", "extra.c"), "hx");
  store.flush();
  const paths = stored(disk).ws;
  assert.equal(Object.keys(paths).length, MAX_LEDGER_PATHS);
  assert.equal(paths["f1.c"], undefined);
});

test("ledger: at most MAX_LEDGER_WORKSPACES — the least-recently-written workspace is evicted", () => {
  const disk = fakeStorage();
  const store = createSyncLedgerStore({ storage: disk });
  for (let i = 0; i < MAX_LEDGER_WORKSPACES; i += 1) {
    store.set(`w${i}`, "a.c", "h");
    store.flush();
  }
  store.set("w0", "b.c", "h"); // w0 written again → w1 is now the oldest
  store.flush();
  store.set("w-new", "a.c", "h");
  store.flush();
  const doc = stored(disk);
  assert.equal(Object.keys(doc).length, MAX_LEDGER_WORKSPACES);
  assert.equal(doc.w1, undefined);
  assert.ok(doc.w0 && doc["w-new"] && doc.w2);
  // An evicted workspace reads as "never synced" after a reload — the safe direction.
  assert.equal(createSyncLedgerStore({ storage: disk }).get("w1", "a.c"), undefined);
});

test("ledger: a quota failure drops least-recently-written workspaces until the write fits", () => {
  const disk = fakeStorage(null, 30); // fits one workspace (20 chars), not two (39)
  const store = createSyncLedgerStore({ storage: disk });
  store.set("old", "a.c", "h1");
  store.set("new", "a.c", "h2");
  store.flush();
  assert.deepEqual(stored(disk), { new: { "a.c": "h2" } });
});

test("ledger: writes are debounced; flush() writes synchronously; an idle flush writes nothing", async () => {
  const disk = fakeStorage();
  const store = createSyncLedgerStore({ storage: disk, debounceMs: 20 });
  store.set("ws", "a.c", "h1");
  store.set("ws", "b.c", "h2");
  store.delete("ws", "a.c");
  assert.equal(disk.writes, 0, "nothing reaches storage inside the debounce window");
  store.flush();
  assert.equal(disk.writes, 1, "three changes coalesce into one write");
  store.flush();
  assert.equal(disk.writes, 1);
  store.set("ws", "c.c", "h3");
  await sleep(60);
  assert.equal(disk.writes, 2, "the debounce timer writes on its own");
  assert.deepEqual(stored(disk), { ws: { "b.c": "h2", "c.c": "h3" } });
});

test("ledger: no storage, or storage that throws, degrades to memory-only", () => {
  const memory = createSyncLedgerStore({ storage: null });
  memory.set("ws", "a.c", "h");
  memory.flush();
  assert.equal(memory.get("ws", "a.c"), "h");

  const hostile: LedgerStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
  };
  const store = createSyncLedgerStore({ storage: hostile });
  store.set("ws", "a.c", "h");
  store.flush();
  assert.equal(store.get("ws", "a.c"), "h");
});

test("recordOutboundWrite: undo restores the previous agreement, never a newer one", () => {
  recordSyncedHash("wsU", "a.c", "h-old");
  recordOutboundWrite("wsU", "a.c", "h-new")();
  assert.equal(syncedHashOf("wsU", "a.c"), "h-old", "failed write: back to the last real agreement");

  recordOutboundWrite("wsU", "b.c", "h-new")();
  assert.equal(syncedHashOf("wsU", "b.c"), null, "failed first write: no agreement at all");

  const undo = recordOutboundWrite("wsU", "c.c", "h-mine");
  recordSyncedHash("wsU", "c.c", "h-later"); // e.g. an inbound apply landed meanwhile
  undo();
  assert.equal(syncedHashOf("wsU", "c.c"), "h-later");
});

// A later write that no longer fitted left h(v1) on disk while the tab agreed on h(v2). After a
// reload, attach then took the older base for the truth: the sandbox's v2 applied over an app
// reverted to v1, or the app's v2 written over a `git checkout` back to v1 (devil F2).
const V1 = "int x = 1;\n";
const V2 = "int x = 2; // shell\n";
for (const [name, app, sandbox] of [["the app reverted to v1", V1, V2], ["git checkout put v1 back in the sandbox", V2, V1]] as const) {
  test(`ledger F2, ${name}: a write that no longer fits leaves no older base, so attach reports a conflict`, async () => {
    const origin = originStorage(400);
    const store = createSyncLedgerStore({ storage: origin });
    store.set("ws-f2", "a.c", await sha16(V1));
    store.flush();
    store.set("ws-f2", "a.c", await sha16(V2));
    for (let i = 0; i < 20; i += 1) store.set("ws-f2", `src/longer/path/f${i}.c`, "0123456789abcdef");
    store.flush(); // 21 paths do not fit in 400 characters, even alone
    assert.equal(JSON.parse(origin.getItem(SYNC_LEDGER_KEY) ?? "{}")["ws-f2"], undefined, "no older base on disk");
    configureSyncLedgerStorage(origin); // the reload
    const { provider } = await seeded({ "a.c": sandbox });
    const report = await reconcileOnAttach({ workspaceId: "ws-f2", provider, desired: [{ path: "a.c", content: app }] });
    assert.deepEqual(report.conflicts.map((conflict) => conflict.path), ["a.c"]);
    assert.deepEqual([report.inbound.length, report.written.length], [0, 0]);
    configureSyncLedgerStorage(null);
  });
}

test("ledger F2: workspaces this tab did not change keep their stored base", async () => {
  const origin = originStorage(120, { [SYNC_LEDGER_KEY]: JSON.stringify({ other: { "b.c": "h-other" } }) });
  const store = createSyncLedgerStore({ storage: origin });
  for (let i = 0; i < 10; i += 1) store.set("ws-big", `src/f${i}.c`, "0123456789abcdef");
  store.flush();
  assert.deepEqual(JSON.parse(origin.getItem(SYNC_LEDGER_KEY) ?? "{}"), { other: { "b.c": "h-other" } });
});

test("ledger F2: every changed workspace leaves the stored document, not only the first", async () => {
  const origin = originStorage(400);
  const store = createSyncLedgerStore({ storage: origin });
  store.set("ws-a", "a.c", "h-a1");
  store.set("ws-b", "b.c", "h-b1");
  store.flush();
  for (const ws of ["ws-a", "ws-b"]) for (let i = 0; i < 12; i += 1) store.set(ws, `src/longer/path/f${i}.c`, "0123456789abcdef");
  store.flush(); // neither workspace fits alone any more
  assert.deepEqual(JSON.parse(origin.getItem(SYNC_LEDGER_KEY) ?? "{}"), {});
});
