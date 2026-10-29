/* ************************************************************************** */
/*  lock-menus.test.ts — the view menus and the filter row say a view is      */
/*  locked: what it refuses is disabled or gone, never a live control that    */
/*  the store then quietly ignores.                                           */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { ViewTabMenuItems, LOCKED_VIEW_NOTE, type ViewTabLocks } from "../../src/shared/notion-database-sys/src/components/topBar/ViewTabMenu.tsx";
import { ViewDotsMenu } from "../../src/shared/notion-database-sys/src/components/topBar/MenuComponents.tsx";
import { FilterBar } from "../../src/shared/notion-database-sys/src/components/filters/FilterBar.tsx";
import { DatabaseStoreProvider, createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import type { ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

const noop = (): void => undefined;
const OPEN: ViewTabLocks = { view: false, settings: false, database: false };
const VIEW: ViewConfig = {
  id: "a", databaseId: "d", name: "All", type: "table",
  filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["t"], settings: {},
};

/** Button text → whether it is disabled, in render order. */
function buttons(html: string): Map<string, boolean> {
  const rows = new Map<string, boolean>();
  for (const [, attrs, body] of html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)) {
    const label = body.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "").trim();
    rows.set(label, /\sdisabled=""/.test(attrs));
  }
  return rows;
}

test("the view-tab menu disables what each lock refuses and hides Delete on a locked view", () => {
  const render = (locks: ViewTabLocks) => renderToString(React.createElement(ViewTabMenuItems, {
    view: VIEW, canDelete: true, locks, sourceName: "Files", onClose: noop, onRename: noop, onEditView: noop,
    onDuplicate: noop, onDelete: noop, onToggleSourceTitle: noop, onDisplayAs: noop,
  }));
  const open = buttons(render(OPEN));
  assert.equal([...open.values()].some(Boolean), false);
  assert.ok(open.has("Delete view"));

  const html = render({ view: true, settings: true, database: true });
  const locked = buttons(html);
  assert.ok(html.includes(LOCKED_VIEW_NOTE));
  for (const label of ["Rename", "Display as", "Edit view", "Hide data source titles", "Duplicate view"]) {
    assert.equal(locked.get(label), true, `${label} is disabled`);
  }
  assert.equal(locked.has("Delete view"), false);
  assert.equal(locked.get("Copy link to view"), false);
});

test("the view ⋯ menu drops the entries a lock refuses and says the view is locked", () => {
  const render = (locks: ViewTabLocks) => renderToString(React.createElement(ViewDotsMenu, {
    show: true, onToggle: noop, onClose: noop, containerRef: { current: null }, onDuplicate: noop,
    onEditTitle: noop, onEditLayout: noop, isHoverVisible: true, viewId: "a", onSetIcon: noop, onToggleTitle: noop, locks,
  }));
  const refused = ["Duplicate view", "Edit title", "Edit icon", "Edit layout", "Hide title"];
  const open = render(OPEN);
  for (const label of refused) assert.ok(open.includes(label), `${label} is offered when open`);
  assert.equal(open.includes(LOCKED_VIEW_NOTE), false);

  const locked = render({ view: true, settings: true, database: true });
  for (const label of refused) assert.equal(locked.includes(label), false, `${label} is gone when locked`);
  assert.ok(locked.includes(LOCKED_VIEW_NOTE));
  assert.ok(locked.includes("Copy link to view"));
});

test("a locked view's filter chips still read as the rule but open nothing, and there is no + Filter", () => {
  const store = createDatabaseStore();
  const render = (locked: boolean, activeFilterId: string | null) => renderToString(React.createElement(
    DatabaseStoreProvider, { value: store },
    React.createElement(FilterBar, {
      filters: [{ id: "f1", propertyId: "t", operator: "contains", value: "al" }],
      properties: { t: { id: "t", name: "Name", type: "title" } },
      conjunction: "and", viewId: "a", onOpenAdvanced: noop, activeFilterId, onActiveFilterChange: noop, locked,
    }),
  ));
  const open = buttons(render(false, null));
  assert.equal(open.get("Filter"), false);
  assert.equal([...open.values()].some(Boolean), false);

  // An editor left open from before the lock does not render over a locked view.
  const html = render(true, "f1");
  const locked = buttons(html);
  assert.equal(locked.has("Filter"), false);
  assert.deepEqual([...locked.values()], [true]);
  assert.match(html, /this view is locked/);
  assert.match(html, /aria-expanded="false"/);
});
