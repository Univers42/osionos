/* ************************************************************************** */
/*  read-only-records.test.ts — a host that refuses record writes (a `sys:`   */
/*  source: your own tasks, pages, people) gets no "New" anywhere: a click    */
/*  would add a row the adapter drops on its next reload.                     */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { createDatabaseStore, DatabaseStoreProvider } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import { HostAdaptersProvider } from "../../src/shared/notion-database-sys/src/hooks/useHostAdapters.tsx";
import { DatabaseScopeProvider } from "../../src/shared/notion-database-sys/src/hooks/useDatabaseScope.tsx";
import { BoardView } from "../../src/shared/notion-database-sys/src/components/views/board/BoardView.tsx";
import { CalendarView } from "../../src/shared/notion-database-sys/src/components/views/calendar/CalendarView.tsx";
import { FeedView } from "../../src/shared/notion-database-sys/src/components/views/feed/FeedView.tsx";
import { GalleryView } from "../../src/shared/notion-database-sys/src/components/views/gallery/GalleryView.tsx";
import { ListView } from "../../src/shared/notion-database-sys/src/components/views/list/ListView.tsx";
import { TableView } from "../../src/shared/notion-database-sys/src/components/views/table/TableView.tsx";
import { TimelineView } from "../../src/shared/notion-database-sys/src/components/views/timeline/TimelineView.tsx";
import { TableGroupRows } from "../../src/shared/notion-database-sys/src/components/views/table/TableGroupRows.tsx";
import { layoutGroupRows } from "../../src/shared/notion-database-sys/src/components/views/table/groupRowsLayout.ts";
import { TopBarActions, type TopBarActionsProps } from "../../src/shared/notion-database-sys/src/components/topBar/TopBarActions.tsx";
import type { DatabaseSchema, Page, ViewConfig, ViewType } from "../../src/shared/notion-database-sys/src/types/database.ts";

// DatabaseView itself pulls in the live-mount client, which node's strip-only mode cannot load,
// so each view renders inside the scope DatabaseView would give it.
const VIEWS: Partial<Record<ViewType, React.FC>> = {
  table: TableView, board: BoardView, list: ListView, gallery: GalleryView,
  timeline: TimelineView, calendar: CalendarView, feed: FeedView,
};

interface ViewCase { name: string; type: ViewType; grouped?: boolean; empty?: boolean; settings?: Record<string, unknown> }

// Every place a view offers to create a record. The feed and the agenda offer it only while empty.
const CASES: ViewCase[] = [
  { name: "table", type: "table" },
  { name: "board", type: "board", grouped: true },
  { name: "list", type: "list" },
  { name: "grouped list", type: "list", grouped: true },
  { name: "gallery", type: "gallery" },
  { name: "grouped gallery", type: "gallery", grouped: true },
  { name: "timeline", type: "timeline" },
  { name: "calendar", type: "calendar" },
  { name: "agenda", type: "calendar", empty: true, settings: { calendarMode: "agenda" } },
  { name: "feed", type: "feed", empty: true },
];

const DATABASE = {
  id: "tasks", name: "Tasks", titlePropertyId: "title",
  properties: {
    title: { id: "title", name: "Name", type: "title" },
    status: { id: "status", name: "Status", type: "select", options: [{ id: "todo", value: "To do", color: "gray" }] },
    due: { id: "due", name: "Due", type: "date" },
  },
} as unknown as DatabaseSchema;

const PAGE = {
  id: "p1", databaseId: "tasks", icon: null, cover: null,
  properties: { title: "Write the brief", status: "todo", due: "2026-10-27T09:00:00.000Z" },
  content: [], createdAt: "2026-10-27T08:00:00.000Z", updatedAt: "2026-10-27T08:00:00.000Z",
  createdBy: "You", lastEditedBy: "You",
} as unknown as Page;

function viewOf({ type, grouped, settings }: ViewCase): ViewConfig {
  const dated = type === "timeline" || type === "calendar" ? { showCalendarBy: "due", timelineStartProperty: "due" } : {};
  const grouping = grouped ? { propertyId: "status" } : undefined;
  return {
    id: `v-${type}`, databaseId: "tasks", type, name: type, filters: [], sorts: [],
    visibleProperties: ["title", "status", "due"], settings: { ...dated, ...settings }, grouping,
  } as unknown as ViewConfig;
}

// Caveat: matches a create control by its label ("New", "New page", "New in …", "New event",
// "Create a page") or its "Add page…"/"Add card…" aria-label; a new wording would pass unseen.
const CREATE_LABEL = /<button[^>]*aria-label="Add (?:page|card)|<button[^>]*>(?:(?!<\/button>)[\s\S])*?(?<=[>\s])(?:New(?: page| in| event)?|Create a page)(?=\s*(?:<!-- -->|<\/))/;

function renderView(viewCase: ViewCase, readOnlyRecords: boolean): string {
  const store = createDatabaseStore();
  const view = viewOf(viewCase);
  const pages = viewCase.empty ? {} : { p1: PAGE };
  store.setState({ databases: { tasks: DATABASE }, views: { [view.id]: view }, pages } as never);
  // zustand serves its initial state as the server snapshot; render the seeded one.
  store.getInitialState = store.getState;
  return renderToString(
    React.createElement(DatabaseStoreProvider, { value: store },
      React.createElement(HostAdaptersProvider, { value: { readOnlyRecords } },
        React.createElement(DatabaseScopeProvider, { value: view.id },
          React.createElement(VIEWS[viewCase.type] as React.FC)))),
  );
}

const noop = (): void => undefined;
const ref = { current: null };
const ACTIONS: TopBarActionsProps = {
  variant: "inline", filterBtnRef: ref, settingsBtnRef: ref, sortBtnRef: ref, filters: [], sorts: [],
  showFilterPropertyPicker: false, setShowFilterPropertyPicker: noop, showFilterPanel: false, setShowFilterPanel: noop,
  setShowAdvancedFilter: noop, showSortPanel: false, setShowSortPanel: noop, searchBtnRef: ref, showSearch: false,
  setShowSearch: noop, isFullSize: false, setIsFullSize: noop, showViewSettings: false, setShowViewSettings: noop,
  onOpenAutomations: noop, automationsCount: 0, showExtraActions: false, setShowExtraActions: noop,
  showTemplates: false, setShowTemplates: noop, databaseName: "Tasks", onNewPage: noop,
};

function renderActions(readOnlyRecords: boolean): string {
  return renderToString(
    React.createElement(HostAdaptersProvider, { value: { readOnlyRecords } },
      React.createElement(TopBarActions, ACTIONS)),
  );
}

test("the header offers New on a writable database and none on a read-only one", () => {
  assert.match(renderActions(false), CREATE_LABEL);
  assert.doesNotMatch(renderActions(true), CREATE_LABEL);
});

// The table virtualizer draws no rows on the server, so its grouped body renders on its own.
function renderGroupRows(writable: boolean): string {
  const groups = [{ groupId: "todo", groupLabel: "To do", groupColor: "gray", pages: [] }];
  const layout = layoutGroupRows(groups, new Set(), () => 50, writable);
  const props = {
    items: layout.items, firstIndex: 0, colCount: 3, pageSize: 50, fillDrag: null,
    onToggleGroup: noop, onShowMore: noop, onAddToGroup: writable ? noop : undefined,
  } as unknown as React.ComponentProps<typeof TableGroupRows>;
  return renderToString(React.createElement("table", null, React.createElement("tbody", null, React.createElement(TableGroupRows, props))));
}

test("a grouped table adds to a group only when records are writable", () => {
  assert.match(renderGroupRows(true), CREATE_LABEL);
  assert.doesNotMatch(renderGroupRows(false), CREATE_LABEL);
  const kinds = layoutGroupRows([{ groupId: "todo", groupLabel: "To do", groupColor: "gray", pages: [] }], new Set(), () => 50, false)
    .items.map((item) => item.kind);
  assert.deepEqual(kinds, ["header", "empty"]);
});

for (const viewCase of CASES) {
  test(`the ${viewCase.name} view offers a create control only when records are writable`, () => {
    assert.match(renderView(viewCase, false), CREATE_LABEL, `${viewCase.name}: the writable view lost its create control`);
    assert.doesNotMatch(renderView(viewCase, true), CREATE_LABEL, `${viewCase.name}: a read-only view still offers one`);
  });
}
