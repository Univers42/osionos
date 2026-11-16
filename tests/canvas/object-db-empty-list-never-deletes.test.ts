/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-db-empty-list-never-deletes.test.ts         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A push used to read every push-baseline key missing from the state it was handed as a local
// delete: DELETE /api/object-databases/<key>, a hard delete on the server. A browser whose state
// did not persist (storage full), an empty or partial server list, and a flush captured before
// hydrate all hand it such a state, so each one deleted real databases (groot ADR 0051).
// No user action deletes a database, so no push may send a DELETE.

import "./support/memory-local-storage.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { withBridge, type Call, type Reply } from "./support/stub-bridge.ts";

Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "", hash: "" }, localStorage: globalThis.localStorage } });
(globalThis as Record<string, unknown>).__playgroundUserStore = { getState: () => ({ activePageJwt: () => "test-jwt" }) };

const { ensureObjectDatabaseHydration, pushDirtyObjectDatabases, resetObjectDatabaseSync } = await import(
  "../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts"
);

const EMPTY = { databases: {}, pages: {}, views: {} } as unknown as NotionState;

function db(key: string, value = "Acme"): NotionState {
  return {
    databases: { [key]: { id: key, name: key, titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } } } },
    pages: { [`${key}-r9`]: { id: `${key}-r9`, databaseId: key, properties: { t: value }, content: [], createdAt: "2026-11-16T00:00:00.000Z", updatedAt: "2026-11-16T00:00:00.000Z" } },
    views: {},
  } as unknown as NotionState;
}

function merged(...states: NotionState[]): NotionState {
  const pick = (part: "databases" | "pages" | "views") => Object.assign({}, ...states.map((state) => state[part]));
  return { databases: pick("databases"), pages: pick("pages"), views: pick("views") } as unknown as NotionState;
}

const row = (key: string) => ({ dbKey: key, state: db(key) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const deletes = (calls: Call[]) => calls.filter((call) => call.method === "DELETE").map((call) => decodeURIComponent(call.url.split("/").pop() ?? ""));

/** Hydrates `live.state` against the bridge `reply`, then runs `after` and returns every call made. */
async function session(live: { state: NotionState }, reply: (call: Call) => Reply, after: () => void | Promise<void> = () => undefined): Promise<Call[]> {
  return withBridge(reply, async () => {
    const done = new Promise<void>((resolve) => {
      ensureObjectDatabaseHydration({
        getSeedIds: () => new Set(),
        getLiveState: () => live.state,
        getDeletedPageIds: () => new Set(),
        applyMerged: (next: NotionState) => { live.state = next; },
        reconcileRegistry: () => resolve(),
      });
    });
    await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error("hydrate never finished")), 2000))]);
    await settle();
    await after();
    await settle();
  });
}

const listing = (rows: unknown[]) => (call: Call): Reply => ({ body: call.method === "GET" ? { databases: rows } : {} });

beforeEach(() => globalThis.localStorage.setItem("osionos.objectDb.pushed.v1", JSON.stringify({ "db-deals": "h-deals", "db-leads": "h-leads" })));
afterEach(() => resetObjectDatabaseSync());

test("an empty server list deletes nothing", async () => {
  assert.deepEqual(deletes(await session({ state: EMPTY }, listing([]))), []);
});

test("a partial server list deletes nothing", async () => {
  assert.deepEqual(deletes(await session({ state: EMPTY }, listing([row("db-deals")]))), []);
});

test("server rows with an empty state delete nothing", async () => {
  const live = { state: EMPTY };
  const calls = await session(live, listing([{ dbKey: "db-deals", state: {} }, { dbKey: "db-leads", state: {} }]), () => pushDirtyObjectDatabases(EMPTY, new Set()));
  assert.deepEqual(deletes(calls), []);
});

test("a flush captured before hydrate deletes nothing once hydrate pulled the databases", async () => {
  const live = { state: EMPTY };
  const captured = live.state;
  const calls = await session(live, listing([row("db-deals"), row("db-leads")]), () => pushDirtyObjectDatabases(captured, new Set()));
  assert.deepEqual(Object.keys(live.state.databases).sort(), ["db-deals", "db-leads"], "hydrate pulled both");
  assert.deepEqual(deletes(calls), []);
});

test("a database pulled in by a re-hydrate survives a flush captured before it", async () => {
  const live = { state: EMPTY };
  let rows = [row("db-deals")];
  const reply = (call: Call): Reply => (call.method === "POST" ? { status: 409, body: {} } : { body: call.method === "GET" ? { databases: rows } : {} });
  const calls = await session(live, reply, async () => {
    const captured = live.state;
    rows = [row("db-deals"), row("db-y")];
    pushDirtyObjectDatabases(merged(captured, db("db-deals", "edited")), new Set()); // 409 → re-hydrate
    await settle();
    assert.ok(live.state.databases["db-y"], "the re-hydrate pulled db-y");
    pushDirtyObjectDatabases(captured, new Set());
  });
  assert.deepEqual(deletes(calls), []);
});

test("a database missing from the store after hydration is not deleted on the server", async () => {
  const calls = await session({ state: EMPTY }, listing([row("db-deals")]), () => pushDirtyObjectDatabases(EMPTY, new Set()));
  assert.deepEqual(deletes(calls), []);
});
