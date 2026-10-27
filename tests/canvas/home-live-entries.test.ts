import assert from "node:assert/strict";
import { test } from "node:test";
import { applyHomeDemoSeed, homeDemoDay, rebaseHomeDemoDates } from "../../src/widgets/database-view/model/homeDemoSeed.ts";
import { dedupeById, pickRecentEntries, safeCardCover } from "../../src/widgets/database-view/model/homeLiveEntries.ts";

const empty = { databases: {}, pages: {}, views: {} };

test("demo events are relative to the injected today", () => {
  const today = new Date(2031, 0, 30);
  const { pages, views } = applyHomeDemoSeed(empty, today);
  assert.equal(homeDemoDay(today, 3), "2031-02-02");
  assert.equal(String(pages.ev04.properties["ev-date"]).slice(0, 10), "2031-01-30");
  assert.equal(pages.ev04.properties["ev-status"], "evs-today");
  assert.equal(pages.ev01.properties["ev-status"], "evs-past");
  assert.equal(pages.ev05.properties["ev-status"], "evs-upcoming");
  assert.equal(views["v-events-upcoming"].filters[0].value, "2031-01-30T09:00:00.000Z");
});

test("rebase moves stale stored events and keeps other edits", () => {
  const stale = applyHomeDemoSeed(empty, new Date(2026, 5, 26));
  stale.pages.ev05 = { ...stale.pages.ev05, properties: { ...stale.pages.ev05.properties, "ev-title": "Mine" } };
  const next = rebaseHomeDemoDates(stale, new Date(2031, 0, 30));
  assert.equal(next.pages.ev05.properties["ev-title"], "Mine");
  assert.equal(String(next.pages.ev05.properties["ev-date"]).slice(0, 10), "2031-02-02");
  assert.equal(next.views["v-events-upcoming"].filters[0].value, "2031-01-30T09:00:00.000Z");
});

test("recents: workspace-scoped, deduped, skips missing, archived and home pages", () => {
  const entries: Record<string, { _id: string; archivedAt?: string; surface?: string }> = {
    a: { _id: "a" }, b: { _id: "b", archivedAt: "x" }, h: { _id: "h", surface: "home" }, c: { _id: "c" },
  };
  const recents = ["a", "a", "b", "h", "gone", "c"].map((id) => ({ id, kind: "page", workspaceId: "w" }))
    .concat([{ id: "c", kind: "page", workspaceId: "other" }]);
  const picked = pickRecentEntries(recents as never, "w", (id) => entries[id] as never);
  assert.deepEqual(picked.map((e) => e._id), ["a", "c"]);
});

test("dedupeById keeps the first; safeCardCover drops non-image tokens", () => {
  assert.deepEqual(dedupeById([{ _id: "1", n: 1 }, { _id: "1", n: 2 }]).map((e) => e.n), [1]);
  assert.equal(safeCardCover("https://x/y.png"), "https://x/y.png");
  assert.equal(safeCardCover("linear-gradient(red, blue)"), "linear-gradient(red, blue)");
  assert.equal(safeCardCover("sunset"), undefined);
  assert.equal(safeCardCover(null), undefined);
});
