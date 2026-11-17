/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-embed-limit-write.test.ts           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Devil F1 (groot ADR 0055, RC9 re-rule, F-C1 to F-C5). An inline embed shows its views with
// a compact Limit (8, or the block's record cap). The host persists the state it loaded
// against its empty initial store (object_database.tsx:552-557), so that projection was
// written back into the account: 19 of 45 seed views got Limit 8 (L1), an embed's cap of 3
// overwrote an explicit 100 on another database (L2), and every seed database plus each
// clean hydrated one landed in the first-session unload journal (L4: 683,197 chars).
// The projection is render-time only now; what the user picks still persists.

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import {
  createKnownDatabaseAdapter,
  seedSnapshot,
  useKnownDatabaseStateStore,
} from "../../src/widgets/database-view/model/knownDatabaseState.ts";
import { buildUnloadJournal } from "../../src/widgets/database-view/model/knownDatabaseJournal.ts";
import { hashSlice, sliceAllDatabases } from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";
import { resolvePageSize } from "../../src/shared/notion-database-sys/src/hooks/viewPagerMath.ts";
import { withRequestedDatabase } from "../../src/shared/notion-database-sys/src/store/requestedDatabase.ts";

type Options = Parameters<typeof createKnownDatabaseAdapter>[0];
type Adapter = ReturnType<typeof createKnownDatabaseAdapter>;
type View = NotionState["views"][string];

const INLINE: Options = { defaultLoadLimit: 8 };
const EMPTY_HOST = { databases: {}, pages: {}, views: {} };

const store = () => useKnownDatabaseStateStore.getState();
const storedViews = () => store().state.views;
const limitOf = (view: View | undefined) => (view?.settings as { loadLimit?: number } | undefined)?.loadLimit;
const limited = (views: NotionState["views"]) =>
  Object.entries(views).filter(([, view]) => limitOf(view) !== undefined).map(([id, view]) => `${id}=${limitOf(view)}`);

function resetTo(state: NotionState = seedSnapshot()): void {
  store().replaceState(state);
}

function withStoredLimit(viewId: string, loadLimit: number): void {
  const state = store().state;
  const view = state.views[viewId];
  resetTo({ ...state, views: { ...state.views, [viewId]: { ...view, settings: { ...view.settings, loadLimit } } } });
}

// The host's post-load persist: next = what loadState returned, base = the empty initial store.
async function mount(options: Options): Promise<{ adapter: Adapter; loaded: NotionState }> {
  const adapter = createKnownDatabaseAdapter(options);
  const loaded = await adapter.loadState();
  adapter.persistState?.(loaded, { ...loaded, ...EMPTY_HOST });
  return { adapter, loaded };
}

// In-view edits of one debounce window, as the engine's viewSlice makes them, persisted
// against the post-load store.
function editViews(mounted: { adapter: Adapter; loaded: NotionState }, changes: Record<string, (view: View) => View>): void {
  const { adapter, loaded } = mounted;
  const views = { ...loaded.views };
  for (const [viewId, change] of Object.entries(changes)) views[viewId] = change(loaded.views[viewId]);
  adapter.persistState?.({ ...loaded, views }, loaded);
}

const fullPageView = async (viewId: string) => (await createKnownDatabaseAdapter().loadState()).views[viewId];

test("an inline embed still renders its compact default (the read-side projection stays)", async () => {
  resetTo();
  const loaded = await createKnownDatabaseAdapter(INLINE).loadState();
  assert.equal(limitOf(loaded.views["v-tasks-table"]), 8);
  assert.equal(limitOf(storedViews()["v-tasks-table"]), undefined);
});

test("L3 control: a full-page mount's post-load persist changes no view", async () => {
  resetTo();
  const before = storedViews();
  await mount({});
  const changed = Object.keys(before).filter((id) => storedViews()[id] !== before[id]);
  assert.deepEqual(changed, []);
});

test("F-C1 an inline mount writes no Limit: the stored views are the ones it read", async () => {
  resetTo();
  const before = storedViews();
  await mount(INLINE);
  const after = storedViews();
  assert.deepEqual(limited(after), [], "no view gained a Limit");
  assert.deepEqual(Object.keys(after).filter((id) => after[id] !== before[id]), [], "no view was rewritten");
  assert.equal(resolvePageSize(limitOf(await fullPageView("v-tasks-table"))), 50);
});

test("F-C2 an embed's record cap is never written over an explicit Limit elsewhere", async () => {
  resetTo();
  withStoredLimit("v-crm-table", 100);
  const { loaded } = await mount({ ...INLINE, recordCap: 3 });
  assert.equal(limitOf(loaded.views["v-crm-table"]), 3, "the embed itself still shows the cap");
  assert.deepEqual(limited(storedViews()), ["v-crm-table=100"]);
});

for (const picked of [25, 0]) {
  test(`F-C3 a Limit of ${picked} picked in an embed persists, in the store and on a full page`, async () => {
    resetTo();
    const mounted = await mount(INLINE);
    editViews(mounted, { "v-tasks-table": (view) => ({ ...view, settings: { ...view.settings, loadLimit: picked } }) });
    assert.equal(limitOf(storedViews()["v-tasks-table"]), picked);
    assert.equal(limitOf(await fullPageView("v-tasks-table")), picked);
  });
}

test("F-C3 a sort or filter edit in an embed persists without the embed's Limit", async () => {
  resetTo();
  const mounted = await mount(INLINE);
  const sorts = [{ propertyId: "prop-title", direction: "asc" }] as View["sorts"];
  const filters = [{ id: "f1", propertyId: "prop-title", operator: "is_not_empty", value: "" }] as View["filters"];
  editViews(mounted, { "v-tasks-table": (view) => ({ ...view, sorts }), "v-tasks-list": (view) => ({ ...view, filters }) });
  const views = storedViews();
  assert.deepEqual(views["v-tasks-table"].sorts, sorts);
  assert.deepEqual(views["v-tasks-list"].filters, filters);
  assert.deepEqual(limited(views), []);
});

test("F-C3 a sort edit in a capped embed keeps the explicit Limit it was capped from", async () => {
  resetTo();
  withStoredLimit("v-crm-table", 100);
  const mounted = await mount({ ...INLINE, recordCap: 3 });
  const sorts = [{ propertyId: "prop-title", direction: "desc" }] as View["sorts"];
  editViews(mounted, { "v-crm-table": (view) => ({ ...view, sorts }) });
  assert.deepEqual(storedViews()["v-crm-table"].sorts, sorts);
  assert.equal(limitOf(storedViews()["v-crm-table"]), 100);
});

test("F-C4 a new inline database persists its database, view and starter row", async () => {
  resetTo();
  const adapter = createKnownDatabaseAdapter(INLINE);
  const state = withRequestedDatabase(await adapter.loadState(), "db-f1-new", undefined, "F1 new");
  adapter.persistState?.(state, { ...state, ...EMPTY_HOST });
  const stored = store().state;
  assert.equal(stored.databases["db-f1-new"]?.name, "F1 new");
  assert.equal(stored.views["db-f1-new-table"]?.databaseId, "db-f1-new");
  assert.equal(limitOf(stored.views["db-f1-new-table"]), undefined);
  assert.equal(stored.pages["db-f1-new-row-1"]?.databaseId, "db-f1-new");
});

// L4: a database a hydrate added has no base entry and a record equal to its server hash,
// so it is clean (knownDatabaseJournal.ts:79-82) until something rewrites it.
function hydrateUserDatabase(base: NotionState): NotionState {
  const tasks = base.databases["db-tasks"];
  const pages: NotionState["pages"] = {};
  for (let i = 0; i < 50; i += 1) {
    pages[`u-${i}`] = { id: `u-${i}`, databaseId: "db-user", properties: { "prop-title": `row-${i}` }, content: [], createdAt: "2026-11-17T00:00:00.000Z", updatedAt: "2026-11-17T00:00:00.000Z" } as NotionState["pages"][string];
  }
  const userView = { ...base.views["v-tasks-table"], id: "v-user-table", databaseId: "db-user", settings: {} };
  return { databases: { ...base.databases, "db-user": { ...tasks, id: "db-user", name: "User" } }, pages: { ...base.pages, ...pages }, views: { ...base.views, "v-user-table": userView } };
}

test("F-C5 an inline mount journals nothing: not the seed, not a clean hydrated database", async () => {
  const base = seedSnapshot();
  resetTo(hydrateUserDatabase(base));
  const record = { "db-user": hashSlice(sliceAllDatabases(store().state).get("db-user")!) };
  const journal = () => buildUnloadJournal({ tabId: "t", baseIds: ["migrated:t"], landable: [{ id: "migrated:t", state: base, record: {} }], live: store().state, record, deleted: new Set() });
  assert.equal(journal(), null, "nothing differs before the mount");
  await mount(INLINE);
  assert.equal(journal(), null);
});

test("an embed's row edit leaves a view it did not touch as another mount stored it", async () => {
  resetTo();
  const mounted = await mount(INLINE);
  const sorts = [{ propertyId: "prop-title", direction: "asc" }] as View["sorts"];
  const state = store().state;
  resetTo({ ...state, views: { ...state.views, "v-tasks-table": { ...state.views["v-tasks-table"], sorts } } });
  const [pageId] = Object.keys(mounted.loaded.pages);
  const page = mounted.loaded.pages[pageId];
  const pages = { ...mounted.loaded.pages, [pageId]: { ...page, properties: { ...page.properties, edited: "yes" } } };
  mounted.adapter.persistState?.({ ...mounted.loaded, pages }, mounted.loaded);
  assert.deepEqual(storedViews()["v-tasks-table"].sorts, sorts);
  assert.equal(store().state.pages[pageId].properties.edited, "yes");
});

test("a whole-state persist from an embed writes no Limit either", async () => {
  resetTo();
  const adapter = createKnownDatabaseAdapter(INLINE);
  adapter.persistState?.(await adapter.loadState());
  assert.deepEqual(limited(storedViews()), []);
});
