/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   kds-tab.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One browser tab for the known-database revert sequences (devil D1, B1a-B5): the real durable
// copy over the memory store, the real persistence and the real bridge sync, against a fake
// bridge that keeps the server's databases. The live state is held here instead of in the zustand
// store, so a test decides when each flush runs and when a tab closes. The push is the
// persistence's own, never one defined here: B5 must fail if that push stops reading the live state.
// Import memory-local-storage.ts and stub-bridge.ts, and define `window`, before this module.

import assert from "node:assert/strict";
import type { NotionState } from "@notion-db/object-database";
import type { TestContext } from "node:test";
import { openDurableCopy, type DurableCopy } from "../../../src/widgets/database-view/model/knownDatabaseDurableCopy.ts";
import {
  createKnownDatabasePersistence,
  type KnownDatabasePersistence,
} from "../../../src/widgets/database-view/model/knownDatabasePersistence.ts";
import { ensureObjectDatabaseHydration, resetObjectDatabaseSync } from "../../../src/widgets/database-view/model/objectDatabaseBridgeSync.ts";
import {
  loadPersistedKnownDatabaseState,
  serializeKnownDatabaseState,
} from "../../../src/widgets/database-view/model/knownDatabasePersistedState.ts";
import { hashSlice, sliceAllDatabases } from "../../../src/widgets/database-view/model/objectDatabaseSlice.ts";
import type { KeyValueStore } from "../../../src/shared/lib/key-value-store/indexedKeyValueStore.ts";
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from "./memory-key-value-store.ts";
import { isStepUpRead } from "./stub-bridge.ts";

type Page = NotionState["pages"][string];
type Database = NotionState["databases"][string];
type Legacy = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EMPTY: NotionState = { databases: {}, pages: {}, views: {} } as unknown as NotionState;
export const NO_SEEDS: ReadonlySet<string> = new Set();
export const X_OLD = ["x-old-1", "x-old-2"];
export const X_NEW = ["x-new-1", "x-new-2"];

/** `state` with database `key` holding one row per value (synthetic data). */
export function withDb(state: NotionState, key: string, values: string[]): NotionState {
  const pages: Record<string, Page> = {};
  for (const [id, page] of Object.entries(state.pages)) if (page.databaseId !== key) pages[id] = page;
  values.forEach((value, index) => {
    const id = `${key}-r${index}`;
    pages[id] = { id, databaseId: key, properties: { t: value }, content: [], createdAt: "2026-11-17T00:00:00.000Z", updatedAt: "2026-11-17T00:00:00.000Z" } as unknown as Page;
  });
  const database = { id: key, name: key, titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } } } as unknown as Database;
  return { ...state, databases: { ...state.databases, [key]: database }, pages };
}

export function sliceOf(state: NotionState, key: string): NotionState {
  const slice = sliceAllDatabases(state).get(key);
  assert.ok(slice, `no database ${key}`);
  return slice;
}

export const hashOf = (state: NotionState, key: string): string => hashSlice(sliceOf(state, key));

export function valuesOf(state: NotionState | undefined, key: string): string[] {
  return Object.values(state?.pages ?? {})
    .filter((page) => page.databaseId === key)
    .map((page) => String((page.properties as Record<string, unknown>).t))
    .sort();
}

export const settle = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** An IndexedDB copy written by an earlier session of some tab. */
export function storeWith(state: NotionState, record: Record<string, string>): MemoryKeyValueStore {
  return createMemoryKeyValueStore({
    state: { text: serializeKnownDatabaseState(state, new Set()), id: "earlier:1" },
    pushed: { map: record, stateId: "earlier:1" },
  });
}

/** The pair a reload would read. */
export function storedPair(store: MemoryKeyValueStore): { state: NotionState; record: Record<string, string>; id: string } {
  const state = store.entries.get("state") as { text: string; id: string };
  const pushed = store.entries.get("pushed") as { map: Record<string, string> };
  return { state: loadPersistedKnownDatabaseState(state.text, EMPTY).state, record: pushed.map, id: state.id };
}

export function memoryLegacy(initial: Record<string, string> = {}): Legacy & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

export interface FakeBridge {
  server: Map<string, NotionState>;
  posts: { dbKey: string; state: NotionState }[];
  failPosts: boolean;
  /** Every later POST waits until the returned release runs. */
  hold(): () => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function answer(bridge: FakeBridge, gate: () => Promise<void>, init?: RequestInit): Promise<Response> {
  if ((init?.method ?? "GET") === "GET") {
    return json({ databases: [...bridge.server].map(([dbKey, state]) => ({ dbKey, state })) });
  }
  await gate();
  if (bridge.failPosts) return json({ error: "push refused" }, 500);
  const body = JSON.parse(String(init?.body)) as { dbKey: string; state: NotionState };
  bridge.posts.push({ dbKey: body.dbKey, state: body.state });
  bridge.server.set(body.dbKey, body.state);
  return json({});
}

/** The bridge for one test; `server` maps each database to the slice the server holds. */
export function useBridge(t: TestContext, server: Record<string, NotionState>): FakeBridge {
  let held: Promise<void> = Promise.resolve();
  const bridge: FakeBridge = {
    server: new Map(Object.entries(server)),
    posts: [],
    failPosts: false,
    hold() {
      let release = (): void => undefined;
      held = new Promise((resolve) => { release = resolve; });
      return () => release();
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    if (isStepUpRead(String(input), init)) return json({ active: true });
    return answer(bridge, () => held, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; resetObjectDatabaseSync(); });
  return bridge;
}

export const postedValues = (bridge: FakeBridge, key: string): string[][] =>
  bridge.posts.filter((post) => post.dbKey === key).map((post) => valuesOf(post.state, key));

/** K5: the stored record may claim a database matches the server's copy only when the stored
 *  state holds that copy; otherwise a reload unions an older copy over the server's one. */
export function assertStoredPairConsistent(store: MemoryKeyValueStore, bridge: FakeBridge): void {
  const { state, record } = storedPair(store);
  for (const [key, serverSlice] of bridge.server) {
    if (record[key] !== hashOf(serverSlice, key)) continue;
    assert.equal(state.databases[key] ? hashOf(state, key) : undefined, record[key], `stored record runs ahead of the stored ${key}`);
  }
}

export interface Tab {
  live: { state: NotionState; deleted: Set<string> };
  persistence: KnownDatabasePersistence;
  commitReports: boolean[];
  readOnlyWarnings: number;
  /** An edit through the store; false when the store refuses writes. */
  edit(key: string, values: string[]): boolean;
  flush(pushNow?: boolean): void;
  /** Starts the hydration and resolves once it reconciled; its own push is under way then. */
  hydrate(): Promise<void>;
}

interface TabOptions { tabId?: string; legacy?: Legacy; isUnavailable?: boolean }

function tabPersistence(durable: DurableCopy, tab: Tab): KnownDatabasePersistence {
  return createKnownDatabasePersistence({
    durable,
    load: (text) => {
      const loaded = text ? loadPersistedKnownDatabaseState(text, EMPTY) : { state: EMPTY, deletedPageIds: new Set<string>() };
      tab.live = { state: loaded.state, deleted: loaded.deletedPageIds };
    },
    getLiveState: () => tab.live.state,
    serialize: (state) => serializeKnownDatabaseState(state, tab.live.deleted),
    getSeedIds: () => NO_SEEDS,
    getDeletedPageIds: () => tab.live.deleted,
    reportCommit: (isKept) => { tab.commitReports.push(isKept); },
    warnReadOnly: () => { tab.readOnlyWarnings += 1; },
  });
}

function hydrateTab(tab: Tab): Promise<void> {
  return new Promise((resolve) => ensureObjectDatabaseHydration({
    whenReady: () => tab.persistence.ready,
    getSeedIds: () => NO_SEEDS,
    getLiveState: () => tab.live.state,
    getDeletedPageIds: () => tab.live.deleted,
    applyMerged: (state) => { tab.live.state = state; },
    reconcileRegistry: () => resolve(),
  }));
}

export function openTab(store: KeyValueStore, options: TabOptions = {}): Tab {
  const durable = openDurableCopy({
    openStore: () => (options.isUnavailable ? Promise.reject(new Error("IndexedDB does not answer")) : Promise.resolve(store)),
    legacy: options.legacy ?? memoryLegacy(),
    tabId: options.tabId ?? "tab-a",
    budgetMs: 500,
  });
  const tab = { live: { state: EMPTY, deleted: new Set<string>() }, commitReports: [], readOnlyWarnings: 0 } as unknown as Tab;
  tab.persistence = tabPersistence(durable, tab);
  tab.edit = (key, values) => {
    if (!tab.persistence.canWrite()) return false;
    tab.live.state = withDb(tab.live.state, key, values);
    return true;
  };
  tab.flush = (pushNow = false) => tab.persistence.flush(tab.live.state, pushNow);
  tab.hydrate = () => hydrateTab(tab);
  return tab;
}

/** A reload: this origin's stored pair read by a fresh tab, which then hydrates and pushes. */
export async function reload(store: MemoryKeyValueStore): Promise<Tab> {
  resetObjectDatabaseSync();
  const tab = openTab(createMemoryKeyValueStore(Object.fromEntries(store.entries)), { tabId: "tab-reloaded" });
  await tab.persistence.ready;
  await tab.hydrate();
  await settle();
  return tab;
}
