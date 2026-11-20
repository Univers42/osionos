/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   apply-template.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pure apply plan: applying a template replaces a page's blocks, but it must
// never lose or orphan a database. Every input here is deep-frozen, so a write
// the plan might sneak into live or the slice fails loudly.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page/model/types";
import { applyTemplateBlocks, type ShellTarget } from "@/features/page-shells/model/applyShell";
import { planApply, type ApplyRefusal } from "@/features/templates/model/applyTemplate";
import type { DatabaseSlice, TemplateSource } from "@/features/templates/model/templateSlice";
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

function row(id: string, databaseId: string, title: string) {
  return { id, databaseId, properties: { title }, content: [], createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" };
}

/** The user's own state: two databases with rows. Nothing here belongs to a template. */
function liveState(): NotionState {
  return {
    databases: {
      "db-user-notes": { id: "db-user-notes", name: "My notes", titlePropertyId: "title", viewOrder: ["v-notes-table"], properties: { title: { id: "title", name: "Name", type: "title" } } },
      "db-user-tasks": { id: "db-user-tasks", name: "My tasks", titlePropertyId: "title", viewOrder: ["v-user-tasks-board"], properties: { title: { id: "title", name: "Name", type: "title" } } },
    },
    views: {
      "v-notes-table": { id: "v-notes-table", databaseId: "db-user-notes", name: "Table", type: "table", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
      "v-user-tasks-board": { id: "v-user-tasks-board", databaseId: "db-user-tasks", name: "Board", type: "board", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
    },
    pages: {
      "row-notes-1": row("row-notes-1", "db-user-notes", "Groceries"),
      "row-tasks-1": row("row-tasks-1", "db-user-tasks", "Ship the apply plan"),
      "row-tasks-2": row("row-tasks-2", "db-user-tasks", "Review it"),
    },
  } as unknown as NotionState;
}

/** The template's example databases: an input slice, never a state to store. */
function templateSlice(): DatabaseSlice {
  return {
    databases: {
      "tpl-db-tasks": { id: "tpl-db-tasks", name: "Tasks", titlePropertyId: "title", viewOrder: ["tpl-v-board", "tpl-v-dash"], defaultTemplateId: "tpl-task-record", properties: { title: { id: "title", name: "Name", type: "title" } } },
      "tpl-db-events": { id: "tpl-db-events", name: "Events", titlePropertyId: "title", properties: { title: { id: "title", name: "Name", type: "title" } } },
    },
    views: {
      "tpl-v-board": { id: "tpl-v-board", databaseId: "tpl-db-tasks", name: "Board", type: "board", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
      "tpl-v-dash": { id: "tpl-v-dash", databaseId: "tpl-db-tasks", name: "Dash", type: "dashboard", filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings: {} },
      "tpl-v-upcoming": { id: "tpl-v-upcoming", databaseId: "tpl-db-events", name: "Upcoming", type: "list", filters: [], filterConjunction: "and", sorts: [], visibleProperties: ["title"], settings: {} },
    },
    pages: {
      "tpl-task-record": { ...row("tpl-task-record", "tpl-db-tasks", "Task template"), isTemplate: true },
      "tpl-row-1": row("tpl-row-1", "tpl-db-tasks", "Draft the plan"),
      "tpl-row-2": row("tpl-row-2", "tpl-db-tasks", "Ship it"),
      "tpl-event-1": row("tpl-event-1", "tpl-db-events", "Launch"),
    },
  } as unknown as DatabaseSlice;
}

function templateContent(): Block[] {
  return [
    { id: "t-heading", type: "heading_1", content: "Project tracker" },
    { id: "t-db-tasks", type: "database_inline", content: "", databaseId: "tpl-db-tasks", viewId: "tpl-v-board" },
    {
      id: "t-layout", type: "layout", content: "",
      layoutCells: [{ id: "t-cell", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 1, blocks: [{ id: "t-db-events", type: "database_inline", content: "", databaseId: "tpl-db-events", viewId: "tpl-v-upcoming" }] }],
    },
  ] as unknown as Block[];
}

/** Every block sits in the tree `cloneBlock` walks (a block and its children): a
 *  cell's inner blocks are not a block's children, so the fresh-id tests keep
 *  their blocks out of cells. */
function flatTemplateContent(): Block[] {
  return [
    { id: "t-heading", type: "heading_1", content: "Project tracker" },
    { id: "t-db-tasks", type: "database_inline", content: "", databaseId: "tpl-db-tasks", viewId: "tpl-v-board" },
    { id: "t-callout", type: "callout", content: "Steps", children: [{ id: "t-child", type: "paragraph", content: "Do the work" }] },
  ] as unknown as Block[];
}

function templateSource(overrides: Partial<TemplateSource> = {}): TemplateSource {
  return { id: "tpl:project-tracker", title: "Project tracker", content: templateContent(), databases: templateSlice(), ...overrides };
}

function targetPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return { _id: "target-page", title: "My page", workspaceId: "ws", content: [], ...overrides };
}

function blockTree(blocks: Block[] | undefined): Block[] {
  const found: Block[] = [];
  const walk = (list: Block[] | undefined): void => {
    if (!list) return;
    for (const block of list) {
      found.push(block);
      walk(block.children);
      for (const cell of block.layoutCells ?? []) walk(cell.blocks);
    }
  };
  walk(blocks);
  return found;
}

const isDatabaseBlock = (block: Block): boolean => block.type === "database_inline" || block.type === "database_full_page";

const rowsOf = (state: NotionState, databaseId: string): number =>
  Object.values(state.pages).filter((page) => page.databaseId === databaseId).length;

test("the plan's state is the user's plus the clones, exactly (TD9, TD11)", () => {
  const live = deepFreeze(liveState());
  const before = structuredClone(liveState());
  const plan = planApply({ target: targetPage(), template: templateSource(), live, canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const createdIds = plan.created.map((entry) => entry.id);
  assert.equal(createdIds.length, 2, "one clone per database the template embeds");
  assert.deepEqual(new Set(Object.keys(plan.state.databases)), new Set([...Object.keys(before.databases), ...createdIds]), "database ids after = live + created, exactly; no live id removed");
  for (const id of Object.keys(before.views)) assert.ok(plan.state.views[id], `view ${id} stays`);
  for (const id of Object.keys(before.pages)) assert.deepEqual(plan.state.pages[id], before.pages[id], `row ${id} untouched (TD11)`);
  for (const id of Object.keys(templateSlice().databases)) assert.ok(!plan.state.databases[id], `no catalogue database ${id} is stored (TD9)`);
  for (const id of Object.keys(templateSlice().views)) assert.ok(!plan.state.views[id], `no catalogue view ${id} is stored (TD9)`);
  for (const id of Object.keys(templateSlice().pages)) assert.ok(!plan.state.pages[id], `no catalogue row ${id} is stored (TD9)`);
  for (const id of Object.keys(before.databases)) assert.equal(rowsOf(plan.state, id), rowsOf(before, id), `rows of ${id} unchanged (TD11)`);
  assert.deepEqual(live, before, "the plan wrote nothing into the live state");
});

test("every database block points at its own clone, the one in a cell included", () => {
  const plan = planApply({ target: targetPage(), template: templateSource(), live: deepFreeze(liveState()), canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const createdIds = plan.created.map((entry) => entry.id);
  const databases = blockTree(plan.content).filter(isDatabaseBlock);
  assert.equal(databases.length, 2, "both database blocks survive");
  const [tasks, events] = databases;
  assert.ok(tasks && events);
  for (const block of databases) {
    const id = String(block.databaseId);
    assert.ok(createdIds.includes(id), "the block points at a clone");
    assert.notEqual(id, "tpl-db-tasks");
    assert.equal(plan.state.views[String(block.viewId)]?.databaseId, id, "the block's view is the clone's view");
  }
  assert.equal(rowsOf(plan.state, String(tasks.databaseId)), 3, "the tasks clone carries the slice's rows and record template");
  assert.equal(plan.created.find((entry) => entry.id === String(tasks.databaseId))?.name, "Tasks");
});

test("a template block pointing at a database nobody owns aborts with no write (TD10)", () => {
  const live = deepFreeze(liveState());
  const before = structuredClone(liveState());
  const content = [{ id: "t-db", type: "database_inline", content: "", databaseId: "db-nowhere", viewId: "v-nowhere" }] as unknown as Block[];
  const plan = planApply({ target: targetPage(), template: templateSource({ content }), live, canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.deepEqual(plan, { ok: false, reason: "dangling-database" });
  assert.deepEqual(live, before, "the refusal wrote nothing");
});

test("a template block pointing at the user's own database is cloned from live, and the original stays (TD10, TD11)", () => {
  const live = deepFreeze(liveState());
  const before = structuredClone(liveState());
  const content = [{ id: "t-db", type: "database_inline", content: "", databaseId: "db-user-notes", viewId: "v-notes-table" }] as unknown as Block[];
  const plan = planApply({ target: targetPage(), template: templateSource({ content }), live, canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const block = blockTree(plan.content).find(isDatabaseBlock);
  assert.ok(block, "the block survived");
  const cloneId = String(block.databaseId);
  assert.notEqual(cloneId, "db-user-notes", "cloneTemplateDatabases clones any id it finds in state, live ones included");
  assert.ok(plan.created.some((entry) => entry.id === cloneId), "the block points at the clone, so no id dangles");
  for (const id of Object.keys(before.databases)) assert.ok(plan.state.databases[id], `the user's database ${id} is not removed`);
  assert.equal(rowsOf(plan.state, "db-user-notes"), rowsOf(before, "db-user-notes"), "its rows are untouched");
  assert.deepEqual(live, before, "the plan wrote nothing into the live state");
});

test("the gates refuse in order, before any write (TD2, TD12)", () => {
  const live = deepFreeze(liveState());
  const before = structuredClone(liveState());
  const loaded = targetPage();
  const unloaded = targetPage({ _id: "650f1a2b3c4d5e6f7a8b9c0d", content: undefined });
  const mintId = sequentialIds();
  const refusals: Array<{ plan: ReturnType<typeof planApply>; reason: ApplyRefusal }> = [
    { plan: planApply({ target: unloaded, template: templateSource({ content: undefined }), live, canEdit: false, dbWritable: false, mintId }), reason: "read-only" },
    { plan: planApply({ target: unloaded, template: templateSource(), live, canEdit: true, dbWritable: false, mintId }), reason: "not-loaded" },
    { plan: planApply({ target: loaded, template: templateSource({ content: undefined }), live, canEdit: true, dbWritable: false, mintId }), reason: "not-loaded" },
    { plan: planApply({ target: loaded, template: templateSource(), live, canEdit: true, dbWritable: false, mintId }), reason: "db-read-only" },
  ];
  for (const { plan, reason } of refusals) {
    assert.deepEqual(plan, { ok: false, reason });
    assert.deepEqual(live, before, `${reason} wrote nothing`);
  }
});

test("no block id of the template survives into the plan (TD7)", () => {
  const templateIds = new Set(blockTree(flatTemplateContent()).map((block) => block.id));
  const plan = planApply({ target: targetPage(), template: templateSource({ content: flatTemplateContent() }), live: deepFreeze(liveState()), canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(blockTree(plan.content).filter((block) => templateIds.has(block.id)).map((block) => block.id), [], "every block id in the plan is fresh");
});

test("two plans of one template create disjoint databases, none a catalogue id", () => {
  const live = deepFreeze(liveState());
  const mintId = sequentialIds();
  const first = planApply({ target: targetPage(), template: templateSource(), live, canEdit: true, dbWritable: true, mintId });
  const second = planApply({ target: targetPage(), template: templateSource(), live, canEdit: true, dbWritable: true, mintId });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  const firstIds = first.created.map((entry) => entry.id);
  const secondIds = second.created.map((entry) => entry.id);
  assert.equal(firstIds.filter((id) => secondIds.includes(id)).length, 0, "two applies share no database id");
  const sliceIds = Object.keys(templateSlice().databases);
  assert.equal([...firstIds, ...secondIds].filter((id) => sliceIds.includes(id)).length, 0, "and none of them is a catalogue id");
});

test("applyTemplateBlocks still commits fresh-id content through the editor seam", () => {
  const commits: Block[][] = [];
  const focus: string[] = [];
  const target: ShellTarget = { commitContent: (blocks) => { commits.push(blocks); }, focusBlock: (id) => { focus.push(id); } };
  const template = flatTemplateContent();

  assert.equal(applyTemplateBlocks(template, target), true);
  assert.equal(commits.length, 1, "one commit = one undo step");
  assert.ok(commits[0].length > 0);
  const templateIds = new Set(blockTree(template).map((block) => block.id));
  assert.equal(blockTree(commits[0]).filter((block) => templateIds.has(block.id)).length, 0, "the committed blocks have ids of their own");
  assert.equal(focus.length, 1);
  assert.ok(commits[0].some((block) => block.id === focus[0]), "the caret sits in a committed block");

  assert.equal(applyTemplateBlocks([], target), false);
  assert.equal(commits.length, 1, "an empty template commits nothing");
});

test("a slice key the user already owns keeps the user's data, not the slice's (TD11)", () => {
  const slice = templateSlice();
  slice.databases["db-user-notes"] = { ...slice.databases["tpl-db-events"], id: "db-user-notes", name: "Catalogue notes" } as never;
  slice.pages["row-notes-1"] = row("row-notes-1", "db-user-notes", "Catalogue row") as never;
  const live = deepFreeze(liveState());
  const before = structuredClone(liveState());
  const plan = planApply({ target: targetPage(), template: templateSource({ databases: deepFreeze(slice) }), live, canEdit: true, dbWritable: true, mintId: sequentialIds() });

  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.state.databases["db-user-notes"], before.databases["db-user-notes"], "the user's database keeps its own data");
  assert.deepEqual(plan.state.pages["row-notes-1"], before.pages["row-notes-1"], "the user's row keeps its own data");
});
