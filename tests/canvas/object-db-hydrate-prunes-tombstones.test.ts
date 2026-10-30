/* ************************************************************************** */
/*  object-db-hydrate-prunes-tombstones.test.ts — #83: hydration drops the     */
/*  row-delete tombstones the server no longer holds.                          */
/*                                                                            */
/*  tombstonesStillNeeded is covered in row-delete-persists.test.ts; this     */
/*  proves the real hydrate hands its result to the store, so a confirmed     */
/*  deletion stops piling up in localStorage.                                 */
/* ************************************************************************** */

import "./support/memory-local-storage.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { withBridge } from "./support/stub-bridge.ts";

const { ensureObjectDatabaseHydration, resetObjectDatabaseSync } = await import(
  "../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts"
);

const ROW_KEPT = "db-deals-row-1";
const ROW_PENDING = "db-deals-row-2"; // deleted locally, the server still has it
const ROW_GONE = "db-deals-row-3"; // deleted locally, the server dropped it too

function deals(rowIds: string[]): NotionState {
  const pages = Object.fromEntries(rowIds.map((id) => [id, {
    id, databaseId: "db-deals", properties: { title: id }, content: [],
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
  }]));
  return {
    databases: { "db-deals": { id: "db-deals", name: "Deals", titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } } } },
    pages,
    views: {},
  } as unknown as NotionState;
}

/** Runs one hydration against `serverDatabases` and resolves with what the store was told to keep. */
async function hydrateAndCapturePrune(serverDatabases: unknown[]): Promise<Set<string>> {
  let resolveKept!: (kept: Set<string>) => void;
  const kept = new Promise<Set<string>>((resolve) => { resolveKept = resolve; });
  await withBridge(
    (call) => ({ body: call.method === "GET" ? { databases: serverDatabases } : {} }),
    async () => {
      ensureObjectDatabaseHydration({
        getSeedIds: () => new Set(),
        getLiveState: () => deals([ROW_KEPT]),
        getDeletedPageIds: () => new Set([ROW_PENDING, ROW_GONE]),
        pruneDeletedPageIds: (stillNeeded) => resolveKept(new Set(stillNeeded)),
        applyMerged: () => undefined,
      });
      await Promise.race([kept, new Promise((_, reject) => setTimeout(() => reject(new Error("hydrate never pruned")), 2000))]);
    },
  );
  return kept;
}

Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
(globalThis as Record<string, unknown>).__playgroundUserStore = { getState: () => ({ activePageJwt: () => "test-jwt" }) };

afterEach(() => resetObjectDatabaseSync());

test("hydration keeps only the tombstones the server still holds (#83)", async () => {
  const kept = await hydrateAndCapturePrune([{ dbKey: "db-deals", state: deals([ROW_KEPT, ROW_PENDING]) }]);
  assert.deepEqual([...kept], [ROW_PENDING]);
});

test("hydration against an empty server list keeps every tombstone", async () => {
  const kept = await hydrateAndCapturePrune([]);
  assert.deepEqual([...kept].sort(), [ROW_PENDING, ROW_GONE]);
});
