/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sys-data-sources.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// P4-1-b: the six `sys:` data sources — catalog, id gate, answer -> state, the
// read-only adapter, the session-change cache drop and the "My data" slash group.
//
// The state module reads the auth barrel (session signal); it is stubbed with a
// store the test can fire. The transport is injected, so the api client (which
// reads import.meta.env) is never loaded.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

const AUTH_STUB = `
const listeners = new Set();
globalThis.__sysAuth = { activeUserId: "u1", sessions: { u1: { accessToken: "t1" } } };
export const useUserStore = {
  getState: () => globalThis.__sysAuth,
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
globalThis.__sysAuthFire = (next) => { const prev = globalThis.__sysAuth; globalThis.__sysAuth = next; for (const l of listeners) l(next, prev); };
`;
const BY_SUFFIX: [string, string][] = [["/src/features/auth/index.ts", AUTH_STUB]];
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    for (const [suffix, code] of BY_SUFFIX) if (resolved.url.endsWith(suffix)) return { url: url(code), shortCircuit: true };
    return resolved;
  },
});

const catalog = await import("../../src/widgets/database-view/model/sysDataSources.ts");
const state = await import("../../src/widgets/database-view/model/sysDatabaseState.ts");
const slash = await import("../../src/features/slash-commands/model/sysSlashCommands.ts");

const fixture: { id: string; columns: string[] }[] = JSON.parse(
  readFileSync(new URL("../fixtures/sys-sources.json", import.meta.url), "utf8"),
);
const sleep = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const answer = (source: string, columns: string[], rows: Record<string, unknown>[], truncated = false) =>
  ({ ok: true, source, columns, rows, truncated });
const stub = (body: unknown, fail = false) => ({
  calls: [] as string[],
  async get<T>(path: string): Promise<T> {
    this.calls.push(path);
    if (fail) throw new Error("500");
    return body as T;
  },
});

test("the catalog has the six sources, ids match the bridge fixture", () => {
  assert.deepEqual(catalog.SYS_SOURCES.map((s: { source: string }) => s.source).sort(), fixture.map((f) => f.id).sort());
  for (const s of catalog.SYS_SOURCES) {
    const cols = fixture.find((f) => f.id === s.source)!.columns;
    assert.ok(cols.includes(s.titleColumn), `${s.source} title column is a real column`);
    for (const col of [...s.hiddenColumns, ...Object.keys(s.columnTypes)]) assert.ok(cols.includes(col), `${s.source}.${col} exists`);
    assert.equal(s.id, `sys:${s.source}`);
    assert.equal(s.defaultViewId, `${s.source}-default`);
  }
});

test("isSysDatabaseId accepts only sys: + a shipped source", () => {
  assert.equal(catalog.isSysDatabaseId("sys:my-pages"), true);
  for (const bad of ["sys:", "sys:nope", "sys:my-activity", "my-pages", "", null, undefined, "SYS:my-pages"]) {
    assert.equal(catalog.isSysDatabaseId(bad as string), false, String(bad));
  }
});

test("loadSysSourceState builds schema, records and the default view from an answer", async () => {
  const columns = ["id", "title", "surface", "mystery", "updated_at"];
  const t = stub(answer("my-pages", columns, [
    { id: "p1", title: "Plan", surface: "doc", mystery: { name: "Ada", x: 1 }, updated_at: "2026-10-01T00:00:00Z" },
    { id: "p2", title: null, surface: "agent", mystery: [1], updated_at: null },
  ], true));
  const result = await state.loadSysSourceState("sys:my-pages", t);
  assert.deepEqual(t.calls, ["/api/account/self-data/my-pages"]);
  const db = result.state.databases["sys:my-pages"];
  assert.equal(db.titlePropertyId, "title");
  assert.deepEqual(Object.keys(db.properties), columns);
  assert.equal(db.properties.surface.type, "select");
  assert.equal(db.properties.mystery.type, "text", "a column outside the catalog falls back to text");
  assert.equal(db.properties.updated_at.type, "last_edited_time");
  assert.equal(result.truncated, true);
  assert.equal(result.state.pages.p1.properties.mystery, "Ada");
  assert.equal(result.state.pages.p2.properties.mystery, "[1]");
  const view = result.state.views["my-pages-default"];
  assert.equal(view.type, "table");
  assert.ok(!view.visibleProperties.includes("id") && !view.visibleProperties.includes("title"));
  assert.ok(view.visibleProperties.includes("surface"));
});

test("a non-2xx or malformed answer throws instead of returning an empty state", async () => {
  await assert.rejects(() => state.loadSysSourceState("sys:my-pages", stub(null, true)));
  await assert.rejects(() => state.loadSysSourceState("sys:my-pages", stub({ ok: false })));
  await assert.rejects(() => state.loadSysSourceState("sys:nope", stub(answer("x", [], []))));
});

test("my-connections shows one row per person, the newest first", async () => {
  const rows = [
    { id: "a", peer: { userId: "u9", name: "Zed" }, created_at: "2026-01-01T00:00:00Z" },
    { id: "b", peer: { userId: "u9", name: "Zed" }, created_at: "2026-03-01T00:00:00Z" },
    { id: "c", peer: { userId: "u2", name: "Amy" }, created_at: "2026-02-01T00:00:00Z" },
  ];
  const result = await state.loadSysSourceState("sys:my-connections", stub(answer("my-connections", ["id", "peer", "created_at"], rows)));
  assert.deepEqual(Object.keys(result.state.pages), ["b", "c"]);
});

test("the adapter is read-only: every write leaves the state as loaded", async () => {
  state.clearSysSourceStateCache();
  const t = stub(answer("my-tasks", ["page_id", "block_id", "content", "checked"], [{ page_id: "p", block_id: "b", content: "x", checked: true }]));
  const adapter = state.getSysDatabaseAdapter("sys:my-tasks", t);
  const before = await adapter.loadState();
  assert.equal(before.pages["p:b"].properties.checked, true);
  await adapter.patchPage("p:b", { properties: { content: "edited" } });
  await adapter.insertPage("sys:my-tasks", { properties: {} });
  await adapter.deletePage("p:b");
  await adapter.addProperty("sys:my-tasks", { id: "z", name: "z", type: "text" });
  await adapter.removeProperty("sys:my-tasks", "content");
  await adapter.changePropertyType("sys:my-tasks", "content", "number");
  assert.deepEqual(await adapter.getPage("p:b"), before.pages["p:b"]);
  assert.equal((await adapter.findPages({ databaseId: "sys:my-tasks" })).length, 1);
  assert.equal((await adapter.loadState()).databases["sys:my-tasks"].properties.content.type, "title");
});

test("a session change drops the cached rows and asks for a reload", async () => {
  state.clearSysSourceStateCache();
  const t = stub(answer("my-pages", ["id", "title"], [{ id: "p1", title: "A" }]));
  const adapter = state.getSysDatabaseAdapter("sys:my-pages", t);
  let events = 0;
  const off = adapter.subscribe(() => { events += 1; });
  await adapter.loadState();
  assert.equal(state.getSysSourceStateCacheSize(), 1);
  globalThis.__sysAuthFire({ activeUserId: "u1", sessions: { u1: { accessToken: "t1" } } });
  await sleep();
  assert.equal(state.getSysSourceStateCacheSize(), 1, "an unrelated store change keeps the cache");
  globalThis.__sysAuthFire({ activeUserId: "u2", sessions: { u2: { accessToken: "t2" } } });
  await sleep();
  assert.equal(state.getSysSourceStateCacheSize(), 0);
  assert.ok(events >= 1);
  off();
});

test("the My data slash group lists the six sources as database views", () => {
  const commands = slash.buildSysSlashCommands();
  assert.equal(commands.length, 6);
  for (const c of commands) {
    assert.equal(c.kind, "database-view");
    assert.equal(c.section, "my-data");
    assert.equal(c.viewType, "table");
    assert.ok(catalog.isSysDatabaseId(c.databaseId));
    assert.equal(c.viewId, `${c.databaseId.slice(4)}-default`);
  }
  assert.ok(commands.some((c: { label: string }) => c.label === "My pages"));
});

test("the catalog registers the My data section and its sys: commands", () => {
  const text = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");
  assert.match(text, /"my-data":\s*"My data"/);
  assert.match(text, /SECTION_ORDER[\s\S]*?"my-data"/);
  assert.match(text, /\.\.\.buildSysSlashCommands\(\)/);
});

test("sys: ids are never registered as data-source providers", () => {
  const text = readFileSync(new URL("../../src/widgets/database-view/model/sysDatabaseState.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /registerDataSourceProvider/);
});
