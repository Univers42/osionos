/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   apply-to-page.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block } from "@/entities/block";
import type { EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import type { PageEntry } from "@/entities/page/model/types";
import { applyToPageWith, type ApplyFailure, type ApplyMode, type ApplyToPageDeps } from "@/features/templates/model/applyToPage";
import type { DatabaseSlice, TemplateSource } from "@/features/templates/model/templateSlice";
import type { CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";
import type { NotionState } from "@notion-db/object-database";

interface Trace {
  calls: string[];
  copied: Block[][];
  commits: Array<{ state: NotionState; created: CreatedEntry[] }>;
  labels: string[];
  updates: Block[][];
}

function sequentialIds(): (prefix: string) => string {
  let next = 0;
  return (prefix) => `${prefix}-n${++next}`;
}

function row(id: string) {
  return { id, databaseId: "db-live", properties: { title: id }, content: [], createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", createdBy: "Demo", lastEditedBy: "Demo" };
}

function liveState(): NotionState {
  return {
    databases: { "db-live": { id: "db-live", name: "Live", titlePropertyId: "title", properties: { title: { id: "title", name: "Name", type: "title" } } } },
    views: {},
    pages: { "row-1": row("row-1"), "row-2": row("row-2") },
  } as NotionState;
}

function templateSource(): TemplateSource {
  return {
    id: "tpl:project", title: "Project template",
    content: [
      { id: "tpl-paragraph", type: "paragraph", content: "Hello" },
      { id: "tpl-database", type: "database_inline", content: "", databaseId: "tpl-db" },
    ],
    databases: {
      databases: { "tpl-db": { id: "tpl-db", name: "Template database", titlePropertyId: "title", properties: { title: { id: "title", name: "Name", type: "title" } } } },
      views: {}, pages: {},
    } as DatabaseSlice,
  };
}

function loadedContent(): Block[] {
  return [{ id: "loaded-paragraph", type: "paragraph", content: "Before" }];
}

function targetPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return { _id: "p1", title: "Target", workspaceId: "ws", content: loadedContent(), ...overrides };
}

function fakeHandle(content: Block[]): EditorHandle {
  return {
    sourceKey: "page:p1", pageId: "p1", kind: "linear",
    getContent: () => content, updateContent: () => undefined,
    undo: () => undefined, redo: () => undefined, canUndo: () => false, canRedo: () => false,
    focusBlock: () => undefined, selectAll: () => undefined,
  };
}

function baseDeps(handle: EditorHandle, target: PageEntry, live: NotionState, overrides: Partial<ApplyToPageDeps>): ApplyToPageDeps {
  return {
    handleFor: () => handle, page: () => target, canEditBody: () => true,
    whenDatabasesReady: () => Promise.resolve(), liveDatabases: () => live,
    dbWritable: () => true, mintId: sequentialIds(),
    copyPage: async (page, content) => ({ ...page, _id: "copy-1", content: structuredClone(content) }),
    commitDatabases: () => undefined, saveVersion: () => true,
    ...overrides,
  };
}

function recordDeps(deps: ApplyToPageDeps, handle: EditorHandle, trace: Trace): void {
  const copyPage = deps.copyPage;
  const commitDatabases = deps.commitDatabases;
  const saveVersion = deps.saveVersion;
  const getContent = handle.getContent;
  const updateContent = handle.updateContent;
  deps.copyPage = async (page, content) => {
    trace.calls.push("copyPage"); trace.copied.push(content); return copyPage(page, content);
  };
  deps.commitDatabases = (state, created) => {
    trace.calls.push("commitDatabases"); trace.commits.push({ state, created }); commitDatabases(state, created);
  };
  deps.saveVersion = (id, label) => {
    trace.calls.push("saveVersion"); trace.labels.push(label); return saveVersion(id, label);
  };
  handle.getContent = () => { trace.calls.push("getContent"); return getContent(); };
  handle.updateContent = (blocks) => { trace.calls.push("updateContent"); trace.updates.push(blocks); updateContent(blocks); };
}

function fakeDeps(overrides: Partial<ApplyToPageDeps> = {}) {
  const loaded = loadedContent();
  const live = liveState();
  const target = targetPage({ content: loaded });
  const handle = fakeHandle(loaded);
  const trace: Trace = { calls: [], copied: [], commits: [], labels: [], updates: [] };
  const deps = baseDeps(handle, target, live, overrides);
  recordDeps(deps, handle, trace);
  return { deps, handle, trace, live, loaded, template: templateSource() };
}

type Fake = ReturnType<typeof fakeDeps>;
const EFFECTS = ["getContent", "copyPage", "commitDatabases", "saveVersion", "updateContent"];
const effects = (calls: string[]): string[] => calls.filter((call) => EFFECTS.includes(call));
const run = (fake: Fake, mode: ApplyMode = "keep-copy") => applyToPageWith(fake.deps, "p1", fake.template, mode);

function assertNoWrites(calls: string[], copyAllowed = false): void {
  const forbidden = ["commitDatabases", "saveVersion", "updateContent", ...(copyAllowed ? [] : ["copyPage"])];
  for (const name of forbidden) assert.equal(calls.includes(name), false, `${name} was called`);
}

async function expectRefusal(overrides: Partial<ApplyToPageDeps>, reason: ApplyFailure): Promise<void> {
  const fake = fakeDeps(overrides);
  assert.deepEqual(await run(fake), { ok: false, reason });
  assertNoWrites(fake.trace.calls);
}

async function expectCopyFailure(overrides: Partial<ApplyToPageDeps>): Promise<void> {
  const fake = fakeDeps(overrides);
  assert.deepEqual(await run(fake), { ok: false, reason: "copy-failed" });
  assertNoWrites(fake.trace.calls, true);
  assert.deepEqual(effects(fake.trace.calls), ["getContent", "copyPage"]);
}

test("no page editor mounted → not-open", () => expectRefusal({ handleFor: () => null }, "not-open"));
test("read-only page → read-only", () => expectRefusal({ canEditBody: () => false }, "read-only"));
test("unloaded target → not-loaded", () => expectRefusal({
  page: () => targetPage({ _id: "650f1a2b3c4d5e6f7a8b9c0d", content: undefined }),
}, "not-loaded"));
test("database store not writable → db-read-only and no copy", () => expectRefusal({ dbWritable: () => false }, "db-read-only"));
test("copy returns null → copy-failed", () => expectCopyFailure({ copyPage: async () => null }));
test("copy throws → copy-failed", () => expectCopyFailure({ copyPage: async () => { throw new Error("copy failed"); } }));
test("copy content differs → copy-failed", () => expectCopyFailure({
  copyPage: async (page) => ({ ...page, _id: "copy-1", content: [] }),
}));

test("editor swapped during copy → not-open", async () => {
  const fake = fakeDeps();
  const other = { ...fake.handle };
  let lookups = 0;
  fake.deps.handleFor = () => { lookups += 1; return lookups === 1 ? fake.handle : other; };
  assert.deepEqual(await run(fake), { ok: false, reason: "not-open" });
  assertNoWrites(fake.trace.calls, true);
});

test("content edited during copy → changed-during-copy", async () => {
  const fake = fakeDeps();
  const read = fake.handle.getContent;
  const edited: Block[] = [{ id: "edited", type: "paragraph", content: "Edited" }];
  let reads = 0;
  fake.handle.getContent = () => { const content = read(); reads += 1; return reads === 2 ? edited : content; };
  assert.deepEqual(await run(fake), { ok: false, reason: "changed-during-copy" });
  assertNoWrites(fake.trace.calls, true);
});

test("commitDatabases throws → commit-failed", async () => {
  const fake = fakeDeps({ commitDatabases: () => { throw new Error("read only"); } });
  assert.deepEqual(await run(fake), { ok: false, reason: "commit-failed" });
  assert.equal(fake.trace.calls.includes("saveVersion"), false);
  assert.equal(fake.trace.calls.includes("updateContent"), false);
});

test("keep-copy happy path runs in order", async () => {
  const fake = fakeDeps();
  assert.deepEqual(await run(fake), { ok: true, copyId: "copy-1", versionSaved: true });
  assert.deepEqual(effects(fake.trace.calls), ["getContent", "copyPage", "getContent", "commitDatabases", "saveVersion", "updateContent"]);
  assert.deepEqual(fake.trace.copied, [fake.loaded]);
  assert.deepEqual(fake.trace.labels, ["Before template: Project template"]);
});

test("replace never copies", async () => {
  const fake = fakeDeps();
  assert.deepEqual(await run(fake, "replace"), { ok: true, copyId: null, versionSaved: true });
  assert.equal(fake.trace.calls.includes("copyPage"), false);
  assert.equal(fake.trace.updates.length, 1);
});

test("committed state keeps every live database and adds only the clones", async () => {
  const fake = fakeDeps();
  assert.equal((await run(fake)).ok, true);
  const commit = fake.trace.commits[0];
  assert.ok(commit);
  const createdIds = commit.created.map((entry) => entry.id);
  assert.deepEqual(new Set(Object.keys(commit.state.databases)), new Set([...Object.keys(fake.live.databases), ...createdIds]));
  assert.equal(Object.values(commit.state.pages).filter((page) => page.databaseId === "db-live").length, 2);
});

test("committed content uses fresh block ids and points at created databases", async () => {
  const fake = fakeDeps();
  await run(fake);
  const content = fake.trace.updates[0];
  const commit = fake.trace.commits[0];
  assert.ok(content && commit);
  const templateIds = new Set((fake.template.content ?? []).map((block) => block.id));
  for (const block of content) assert.equal(templateIds.has(block.id), false);
  const createdIds = commit.created.map((entry) => entry.id);
  const databases = content.filter((block) => block.type === "database_inline" || block.type === "database_full_page");
  assert.equal(databases.length, 1);
  for (const block of databases) assert.ok(createdIds.includes(String(block.databaseId)));
});

test("a version that could not be saved is reported", async () => {
  const fake = fakeDeps({ saveVersion: () => false });
  assert.deepEqual(await run(fake), { ok: true, copyId: "copy-1", versionSaved: false });
});

test("inputs are not mutated", async () => {
  const fake = fakeDeps();
  const templateBefore = structuredClone(fake.template);
  const liveBefore = structuredClone(fake.live);
  await run(fake);
  assert.deepEqual(fake.template, templateBefore);
  assert.deepEqual(fake.live, liveBefore);
});
