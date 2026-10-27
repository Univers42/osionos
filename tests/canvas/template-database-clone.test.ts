/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   template-database-clone.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page made from a template must get its own databases: before this, every copy
// pointed at the one shared demo database (db-tasks …), which never reached the server.

import assert from "node:assert/strict";
import { test } from "node:test";

import { cloneTemplateDatabases } from "@/widgets/database-view/model/templateDatabaseClone";
import type { Block } from "@/entities/block";
import type { NotionState } from "@notion-db/object-database";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function sequentialIds(): (prefix: string) => string {
  let next = 0;
  return (prefix) => `${prefix}-n${++next}`;
}

function fixtureState(): NotionState {
  return {
    databases: {
      "db-tasks": {
        id: "db-tasks",
        name: "Tasks",
        titlePropertyId: "title",
        viewOrder: ["v-tasks-board", "v-tasks-dash"],
        defaultTemplateId: "task-tpl",
        properties: {
          title: { id: "title", name: "Name", type: "title" },
          blocked: { id: "blocked", name: "Blocked by", type: "relation", relationConfig: { databaseId: "db-tasks", type: "one_way" } },
          event: { id: "event", name: "Event", type: "relation", relationConfig: { databaseId: "db-events", type: "one_way" } },
        },
      },
      "db-events": {
        id: "db-events",
        name: "Events",
        titlePropertyId: "title",
        properties: { title: { id: "title", name: "Name", type: "title" } },
      },
      "db-other": {
        id: "db-other",
        name: "Not in the template",
        titlePropertyId: "title",
        properties: { title: { id: "title", name: "Name", type: "title" } },
      },
    },
    views: {
      "v-tasks-board": { id: "v-tasks-board", databaseId: "db-tasks", name: "Board", type: "board", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
      "v-tasks-dash": {
        id: "v-tasks-dash", databaseId: "db-tasks", name: "Dash", type: "dashboard", filters: [], filterConjunction: "and", sorts: [], visibleProperties: [],
        settings: {
          dashboardWidgets: [
            { id: "w1", viewId: "v-tasks-board" },
            { id: "w2", viewId: "v-other-table" },
          ],
          dashboardRows: [{ id: "r1", widgetIds: ["w1", "w2"], widths: [0.5, 0.5], height: 300 }],
        },
      },
      "v-events-upcoming": { id: "v-events-upcoming", databaseId: "db-events", name: "Upcoming", type: "list", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
      "v-other-table": { id: "v-other-table", databaseId: "db-other", name: "Table", type: "table", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
    },
    pages: {
      t1: { id: "t1", databaseId: "db-tasks", properties: { title: "Write essay", blocked: ["t2"], event: ["e1"] }, content: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" },
      t2: { id: "t2", databaseId: "db-tasks", properties: { title: "Read chapter", blocked: [], event: [] }, content: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" },
      "task-tpl": { id: "task-tpl", databaseId: "db-tasks", properties: { title: "Task template" }, content: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo", isTemplate: true },
      e1: { id: "e1", databaseId: "db-events", properties: { title: "Exam" }, content: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" },
      o1: { id: "o1", databaseId: "db-other", properties: { title: "Elsewhere" }, content: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" },
    },
  } as unknown as NotionState;
}

function templateContent(): Block[] {
  return [
    { id: "h", type: "heading_1", content: "Student Dashboard" },
    { id: "b1", type: "database_inline", content: "", databaseId: "db-tasks", viewId: "v-tasks-board" },
    {
      id: "lay", type: "layout", content: "",
      layoutCells: [{ id: "c1", blocks: [{ id: "b2", type: "database_inline", content: "", databaseId: "db-events", viewId: "v-events-upcoming" }] }],
    },
    { id: "b3", type: "database_inline", content: "", databaseId: "db-tasks", viewId: "v-tasks-dash" },
    { id: "b4", type: "database_inline", content: "", databaseId: "sys:my-tasks", viewId: "my-tasks-default" },
    { id: "b5", type: "database_inline", content: "", databaseId: "home-recents", viewId: "v-home-recents-gallery" },
  ] as unknown as Block[];
}

const dbBlock = (blocks: Block[], id: string): Block => {
  for (const block of blocks) {
    if (block.id === id) return block;
    for (const cell of block.layoutCells ?? []) {
      const found = cell.blocks.find((inner) => inner.id === id);
      if (found) return found;
    }
  }
  throw new Error(`no block ${id}`);
};

test("each embedded database is cloned once under a fresh id, and the blocks point at the clone", () => {
  const state = deepFreeze(fixtureState());
  const content = deepFreeze(templateContent());
  const out = cloneTemplateDatabases(content, state, sequentialIds());

  const tasks = dbBlock(out.content, "b1");
  const dash = dbBlock(out.content, "b3");
  const events = dbBlock(out.content, "b2");
  assert.notEqual(tasks.databaseId, "db-tasks");
  assert.notEqual(events.databaseId, "db-events");
  assert.equal(tasks.databaseId, dash.databaseId, "two blocks on one database share one clone");
  assert.equal(out.created.length, 2);
  assert.deepEqual(new Set(out.created.map((entry) => entry.id)), new Set([tasks.databaseId, events.databaseId]));
  assert.equal(out.created.find((entry) => entry.id === tasks.databaseId)?.name, "Tasks");
  assert.match(String(tasks.databaseId), /^db-/, "a clone is a user database id");
});

test("schema, views and rows are copied; view and relation ids are remapped", () => {
  const state = deepFreeze(fixtureState());
  const out = cloneTemplateDatabases(deepFreeze(templateContent()), state, sequentialIds());
  const tasksId = String(dbBlock(out.content, "b1").databaseId);
  const eventsId = String(dbBlock(out.content, "b2").databaseId);
  const clone = out.state.databases[tasksId];

  assert.equal(clone.name, "Tasks");
  assert.equal(clone.properties.blocked.relationConfig?.databaseId, tasksId, "a self relation follows the clone");
  assert.equal(clone.properties.event.relationConfig?.databaseId, eventsId, "a relation to another cloned database follows it");

  const boardId = String(dbBlock(out.content, "b1").viewId);
  const dashId = String(dbBlock(out.content, "b3").viewId);
  assert.equal(out.state.views[boardId]?.databaseId, tasksId);
  assert.equal(out.state.views[boardId]?.type, "board");
  assert.deepEqual(clone.viewOrder, [boardId, dashId]);
  const widgets = out.state.views[dashId]?.settings?.dashboardWidgets ?? [];
  assert.equal(widgets[0]?.viewId, boardId, "a widget on a cloned view follows it");
  assert.equal(widgets[1]?.viewId, "v-other-table", "a widget on a database outside the template is kept");

  const rows = Object.values(out.state.pages).filter((page) => page.databaseId === tasksId);
  assert.equal(rows.length, 3, "rows and record templates are copied");
  const essay = rows.find((page) => page.properties.title === "Write essay");
  const chapter = rows.find((page) => page.properties.title === "Read chapter");
  assert.ok(essay && chapter);
  assert.notEqual(essay.id, "t1");
  assert.deepEqual(essay.properties.blocked, [chapter.id], "a relation between copied rows follows the copies");
  const exam = Object.values(out.state.pages).find((page) => page.databaseId === eventsId);
  assert.deepEqual(essay.properties.event, [exam?.id]);
  const template = rows.find((page) => page.isTemplate);
  assert.equal(clone.defaultTemplateId, template?.id);
});

test("the source databases, the template and unrelated data are left untouched", () => {
  const state = deepFreeze(fixtureState());
  const content = deepFreeze(templateContent());
  const out = cloneTemplateDatabases(content, state, sequentialIds());

  assert.deepEqual(out.state.databases["db-tasks"], fixtureState().databases["db-tasks"]);
  assert.deepEqual(out.state.pages.t1, fixtureState().pages.t1);
  assert.equal(out.state.pages.o1?.databaseId, "db-other");
  assert.equal(Object.values(out.state.pages).filter((page) => page.databaseId === "db-other").length, 1, "a database the template does not embed is not cloned");
  assert.equal(dbBlock(out.content, "b4").databaseId, "sys:my-tasks", "the account's own sources are referenced, never cloned");
  assert.equal(dbBlock(out.content, "b5").databaseId, "home-recents");
  assert.equal(dbBlock(content, "b1").databaseId, "db-tasks", "the template's own blocks keep their ids");
});

test("two pages from one template share no database, view or row", () => {
  const state = deepFreeze(fixtureState());
  const content = deepFreeze(templateContent());
  const ids = sequentialIds();
  const first = cloneTemplateDatabases(content, state, ids);
  const second = cloneTemplateDatabases(content, first.state, ids);

  const firstDb = String(dbBlock(first.content, "b1").databaseId);
  const secondDb = String(dbBlock(second.content, "b1").databaseId);
  assert.notEqual(firstDb, secondDb);
  assert.ok(second.state.databases[firstDb], "the first instance's database survives the second clone");
  const firstRows = Object.values(second.state.pages).filter((page) => page.databaseId === firstDb).map((page) => page.id);
  const secondRows = Object.values(second.state.pages).filter((page) => page.databaseId === secondDb).map((page) => page.id);
  assert.equal(firstRows.length, 3);
  assert.equal(secondRows.length, 3);
  assert.equal(firstRows.filter((id) => secondRows.includes(id)).length, 0);
});

test("content with no database block comes back unchanged and creates nothing", () => {
  const state = deepFreeze(fixtureState());
  const content = deepFreeze([{ id: "p", type: "paragraph", content: "hello" }] as unknown as Block[]);
  const out = cloneTemplateDatabases(content, state, sequentialIds());
  assert.deepEqual(out.content, content);
  assert.equal(out.created.length, 0);
  assert.equal(out.state, state, "no clone, no new state object");
});
