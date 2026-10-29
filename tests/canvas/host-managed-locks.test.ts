/* ************************************************************************** */
/*  host-managed-locks.test.ts — a locked view or database refuses edits at   */
/*  the store, not only in the chrome, and a lock the host manages (by        */
/*  workspace role) cannot be lifted or set by the viewer.                    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import { updateDatabaseMeta } from "../../src/shared/notion-database-sys/src/store/sources/dbMetaPersistence.ts";
import { changeRespectsLocks } from "../../src/shared/notion-database-sys/src/lib/lockGuards.ts";
import { TopBarActions, type TopBarActionsProps } from "../../src/shared/notion-database-sys/src/components/topBar/TopBarActions.tsx";
import type { DatabaseSchema, ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

function makeDb(extra: Partial<DatabaseSchema> = {}): DatabaseSchema {
  return { id: "d", name: "Files", titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } }, ...extra };
}

function makeView(id: string, extra: Partial<ViewConfig> = {}): ViewConfig {
  return {
    id, databaseId: "d", name: `view ${id}`, type: "table",
    filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["t"], settings: {}, ...extra,
  };
}

const FILTER = { id: "f1", propertyId: "t", operator: "contains", value: "x" } as ViewConfig["filters"][number];

function storeWith(database: DatabaseSchema, views: ViewConfig[]) {
  const store = createDatabaseStore();
  store.setState({ databases: { d: database }, views: Object.fromEntries(views.map(v => [v.id, v])) });
  return store;
}

test("a locked view keeps its filters, settings and existence", () => {
  const store = storeWith(makeDb(), [makeView("a", { settings: { locked: true } }), makeView("b")]);
  const before = store.getState().views.a;
  store.getState().updateView("a", { filters: [FILTER] });
  store.getState().updateViewSettings("a", { wrapContent: true });
  store.getState().deleteView("a");
  assert.equal(store.getState().views.a, before);
  store.getState().updateView("b", { filters: [FILTER] });
  assert.deepEqual(store.getState().views.b.filters, [FILTER]);
});

test("a locked database takes no new view, rename or reorder", () => {
  const store = storeWith(makeDb({ locked: true, viewOrder: ["a", "b"] }), [makeView("a"), makeView("b")]);
  store.getState().addView({ ...makeView("x"), id: undefined } as unknown as Omit<ViewConfig, "id">);
  store.getState().renameDatabase("d", "Renamed");
  store.getState().reorderViews("d", ["b", "a"]);
  assert.deepEqual(Object.keys(store.getState().views).sort(), ["a", "b"]);
  assert.equal(store.getState().databases.d.name, "Files");
  assert.deepEqual(store.getState().databases.d.viewOrder, ["a", "b"]);
});

test("without a host, a locked view can be unlocked but nothing else in the same write", () => {
  const store = storeWith(makeDb(), [makeView("a", { settings: { locked: true } })]);
  store.getState().updateViewSettings("a", { locked: false, wrapContent: true });
  assert.equal(store.getState().views.a.settings?.locked, true);
  store.getState().updateViewSettings("a", { locked: false });
  assert.equal(store.getState().views.a.settings?.locked, false);
});

test("a lock the host manages is neither lifted nor set by the viewer", () => {
  const locked = storeWith(makeDb({ locksManagedByHost: true }), [makeView("a", { settings: { locked: true } })]);
  locked.getState().updateViewSettings("a", { locked: false });
  assert.equal(locked.getState().views.a.settings?.locked, true);

  const open = storeWith(makeDb({ locksManagedByHost: true }), [makeView("a")]);
  open.getState().updateViewSettings("a", { locked: true });
  assert.equal(open.getState().views.a.settings?.locked, undefined);
  open.getState().updateView("a", { filters: [FILTER] });
  assert.deepEqual(open.getState().views.a.filters, [FILTER]);
});

test("the database lock meta cannot flip a host-managed lock", () => {
  const store = storeWith(makeDb({ locked: true, locksManagedByHost: true }), [makeView("a")]);
  updateDatabaseMeta(store, "d", { locked: false });
  assert.equal(store.getState().databases.d.locked, true);
});

test("the host itself still loads over a locked view", () => {
  const store = storeWith(makeDb({ locked: true, locksManagedByHost: true }), [makeView("a")]);
  store.setState({ views: { a: makeView("a", { filters: [FILTER] }) } });
  assert.deepEqual(store.getState().views.a.filters, [FILTER]);
});

// setActiveView writes the URL hash, which node has no window for; its patch is { activeViewId }.
test("a patch that touches neither views nor databases passes, as switching views does", () => {
  const state = { databases: { d: makeDb({ locked: true }) }, views: { a: makeView("a", { settings: { locked: true } }) } };
  assert.equal(changeRespectsLocks(state, {}), true);
  assert.equal(changeRespectsLocks(state, { views: state.views, databases: state.databases }), true);
});

const noop = (): void => undefined;
const ref = { current: null };
const ACTIONS: TopBarActionsProps = {
  variant: "inline", filterBtnRef: ref, settingsBtnRef: ref, sortBtnRef: ref, filters: [], sorts: [],
  showFilterPropertyPicker: false, setShowFilterPropertyPicker: noop, showFilterPanel: false, setShowFilterPanel: noop,
  setShowAdvancedFilter: noop, showSortPanel: false, setShowSortPanel: noop, searchBtnRef: ref, showSearch: false,
  setShowSearch: noop, isFullSize: false, setIsFullSize: noop, showViewSettings: false, setShowViewSettings: noop,
  onOpenAutomations: noop, automationsCount: 0, showExtraActions: false, setShowExtraActions: noop,
  showTemplates: false, setShowTemplates: noop, databaseName: "Files", onNewPage: noop,
};

const disabledLabels = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>/g)].filter(m => /\sdisabled=""/.test(m[0])).map(m => m[1]);

test("a locked view's header disables Filter, Sort and Automations; a host lock closes View settings too", () => {
  const render = (props: Partial<TopBarActionsProps>) => renderToString(React.createElement(TopBarActions, { ...ACTIONS, ...props }));
  assert.deepEqual(disabledLabels(render({})), []);
  assert.deepEqual(disabledLabels(render({ locked: true })), ["Filter", "Sort", "Automations"]);
  assert.deepEqual(disabledLabels(render({ locked: true, settingsLocked: true })), ["Filter", "Sort", "Automations", "View settings"]);
});
