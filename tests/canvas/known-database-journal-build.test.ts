// The unload journal's contents and its storage (groot ADR 0055 J-C2, J-C5, J-C10): which databases
// and tombstones it carries, the per-tab key, the 1,000,000-character cap and a refused write.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const journal = await import("../../src/widgets/database-view/model/knownDatabaseJournal.ts");
const { EMPTY, withDb, hashOf } = kds;

const L = withDb(withDb(EMPTY, "db-x", ["a", "b"]), "db-y", ["y-1"]);
const REC = { "db-x": hashOf(L, "db-x"), "db-y": hashOf(L, "db-y") };
const base = (id: string, state = L, record: Record<string, string> = REC) => ({ id, state, record });

function build(live: typeof L, landable = [base("earlier:1")], record: Record<string, string> = REC, deleted = new Set<string>()) {
  return journal.buildUnloadJournal({ tabId: "tab-a", baseIds: landable.map((entry) => entry.id), landable, live, record, deleted });
}

test("journal: a database whose slice differs from a base is carried with its record entry", () => {
  const built = build(withDb(L, "db-x", ["a", "b-1"]));
  assert.deepEqual(Object.keys(built?.slices ?? {}), ["db-x"]);
  assert.deepEqual(built?.record, { "db-x": REC["db-x"] });
  assert.deepEqual(built?.bases, ["earlier:1"]);
  assert.equal(built?.tabId, "tab-a");
  assert.equal(Object.hasOwn(built ?? {}, "removed"), false);
});

test("journal: nothing differs from any base → no journal", () => {
  assert.equal(build(L), null);
});

test("journal: a slice equal to one base but not to another is carried (T3)", () => {
  const undone = build(L, [base("earlier:1"), base("tab-a:1", withDb(L, "db-x", ["a", "b-1"]))]);
  assert.deepEqual(Object.keys(undone?.slices ?? {}), ["db-x"]);
});

test("journal: a record entry that moved without its slice is carried (T4)", () => {
  const moved = { ...REC, "db-y": "acked" };
  const built = build(L, [base("earlier:1")], moved);
  assert.deepEqual(Object.keys(built?.slices ?? {}), ["db-y"]);
  assert.deepEqual(built?.record, { "db-y": "acked" });
});

test("journal: a database the record never held is carried without a record entry", () => {
  const built = build(withDb(L, "db-z", ["z"]));
  assert.deepEqual(Object.keys(built?.slices ?? {}), ["db-z"]);
  assert.deepEqual(built?.record, {});
});

// A2 (devil R8): a hydrate adds databases no base holds; a clean one is the server's copy.
test("journal: a clean database no base holds stays out, a dirty one is carried", () => {
  const live = withDb(L, "db-z", ["z"]);
  assert.equal(build(live, [base("earlier:1")], { ...REC, "db-z": hashOf(live, "db-z") }), null);
  const stale = build(live, [base("earlier:1")], { ...REC, "db-z": "older" });
  assert.deepEqual(Object.keys(stale?.slices ?? {}), ["db-z"]);
  assert.deepEqual(stale?.record, { "db-z": "older" });
});

test("journal: no base at all → no journal", () => {
  assert.equal(build(withDb(L, "db-x", ["a", "b-1"]), []), null);
});

test("journal: writtenAt is wall-clock time, comparable across documents", () => {
  const before = Date.now();
  const built = build(withDb(L, "db-x", ["a", "b-1"]));
  assert.ok((built?.writtenAt ?? 0) >= before && (built?.writtenAt ?? 0) <= Date.now());
});

test("journal: the stored length counts a non-Latin-1 character twice", () => {
  assert.equal(journal.storedLength("aé"), 2);
  assert.equal(journal.storedLength("a€"), 3);
});

test("journal: it is stored under this tab's own key", () => {
  const storage = kds.memoryLegacy();
  const built = build(withDb(L, "db-x", ["a", "b-1"]));
  assert.ok(built);
  assert.equal(journal.storeUnloadJournal(storage, built), true);
  assert.deepEqual([...storage.values.keys()], ["osionos.kds.journal.v1.tab-a"]);
  assert.deepEqual(JSON.parse(storage.values.get("osionos.kds.journal.v1.tab-a") ?? "null"), built);
});

test("journal: over the cap in counted characters, nothing is stored and an older own journal goes", () => {
  const storage = kds.memoryLegacy({ "osionos.kds.journal.v1.tab-a": "older" });
  // 500,001 characters, counted 1,000,002: a length check alone would store it.
  const built = build(withDb(L, "db-x", ["a", "€".repeat(500_001)]));
  assert.ok(built);
  assert.equal(journal.storeUnloadJournal(storage, built), false);
  assert.equal(storage.values.size, 0);
});

test("journal: a write the origin still refuses after eviction stores nothing", () => {
  const storage = kds.memoryLegacy({ "osionos.kds.journal.v1.tab-a": "older" });
  storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  const built = build(withDb(L, "db-x", ["a", "b-1"]));
  assert.ok(built);
  assert.equal(journal.storeUnloadJournal(storage, built), false);
  assert.equal(storage.values.size, 0);
});

// A deleted page a base still holds makes its database differ from that base (db-y here), so the
// live set is exactly the journaled databases' tombstones plus those no base can attribute.
test("journal: it carries the live tombstones, which the lost commit would have stored", () => {
  const withY = { ...L, pages: { ...L.pages, "db-y-old": { ...L.pages["db-y-r0"], id: "db-y-old" } } } as typeof L;
  const built = build(withDb(L, "db-x", ["a"]), [base("earlier:1", withY)], REC, new Set(["db-x-r1", "db-y-old", "never-held"]));
  assert.deepEqual(Object.keys(built?.slices ?? {}).sort(), ["db-x", "db-y"]);
  assert.deepEqual(built?.deletedPages, ["db-x-r1", "db-y-old", "never-held"]);
  assert.deepEqual(build(withDb(L, "db-x", ["a", "b-1"]))?.deletedPages, []);
});

test("journal: the tombstones count toward the 1,000,000-character cap", () => {
  const storage = kds.memoryLegacy();
  const many = new Set(Array.from({ length: 100_000 }, (_, index) => `db-x-gone-${index}`));
  const built = build(withDb(L, "db-x", ["a", "b-1"]), [base("earlier:1")], REC, many);
  assert.ok(built && JSON.stringify(built.slices).length < 10_000);
  assert.equal(journal.storeUnloadJournal(storage, built), false);
  assert.equal(storage.values.size, 0);
});
