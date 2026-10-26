/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-db-tab-baseline.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 13:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 13:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Two tabs of one browser share localStorage. A schema edit pushed by a third
// client must reach both tabs, and neither may push its old schema back.

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { createPushBaseline, PUSHED_HASHES_KEY, type PushBaselineStorage } from "../../src/widgets/database-view/model/objectDatabasePushBaseline.ts";
import { reconcileServerDatabases } from "../../src/widgets/database-view/model/objectDatabaseReconcile.ts";
import { hashSlice, sliceDatabase } from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";

function memoryStorage(): PushBaselineStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const state = (expression: string): NotionState => ({
  databases: { "db-1": { id: "db-1", name: "Tracker", properties: { f: { id: "f", type: "formula", formulaConfig: { expression } } } } },
  pages: { r1: { id: "r1", databaseId: "db-1", properties: {} } },
  views: { v1: { id: "v1", databaseId: "db-1", type: "table" } },
}) as unknown as NotionState;

/** One tab's pull: reconcile, adopt the merge, record the new baseline. */
function pull(tab: { live: NotionState; baseline: ReturnType<typeof createPushBaseline> }, server: NotionState) {
  const result = reconcileServerDatabases({
    live: tab.live,
    server: new Map([["db-1", server]]),
    pushed: tab.baseline.load(),
    deletedPageIds: new Set(),
  });
  tab.live = result.merged;
  tab.baseline.save(result.nextPushed);
  return { dirty: !("db-1" in result.nextPushed) };
}

const expressionOf = (live: NotionState) =>
  (live.databases["db-1"] as unknown as { properties: { f: { formulaConfig: { expression: string } } } }).properties.f.formulaConfig.expression;

test("a schema edit from another client reaches two tabs that share localStorage", () => {
  const shared = memoryStorage();
  const before = state("old");
  // Both tabs open on the same synced copy.
  shared.setItem(PUSHED_HASHES_KEY, JSON.stringify({ "db-1": hashSlice(sliceDatabase(before, "db-1")) }));
  const tabX = { live: before, baseline: createPushBaseline(() => shared) };
  const tabY = { live: before, baseline: createPushBaseline(() => shared) };

  const edited = state("new");
  assert.equal(pull(tabX, edited).dirty, false);
  // Y must judge its copy against ITS last sync, not the hash X just stored.
  assert.equal(pull(tabY, edited).dirty, false);
  assert.equal(expressionOf(tabX.live), "new");
  assert.equal(expressionOf(tabY.live), "new");
});

test("a reloaded tab seeds its baseline from localStorage", () => {
  const shared = memoryStorage();
  createPushBaseline(() => shared).save({ "db-1": "h1" });
  assert.deepEqual(createPushBaseline(() => shared).load(), { "db-1": "h1" });
});

test("reset forgets the tab's baseline and the stored one", () => {
  const shared = memoryStorage();
  const baseline = createPushBaseline(() => shared);
  baseline.save({ "db-1": "h1" });
  baseline.reset();
  assert.deepEqual(baseline.load(), {});
});
