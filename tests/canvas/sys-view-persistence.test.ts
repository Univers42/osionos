/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sys-view-persistence.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P4-1-c: saved views on a `sys:` source — the pure diff, the three view calls and the
// null-prototype body. The transport is injected, so the api client (which reads
// import.meta.env) is never loaded.

import assert from "node:assert/strict";
import test from "node:test";

const views = await import("../../src/widgets/database-view/model/sysDatabaseViews.ts");

const DEFAULT_ID = "my-pages-default";
const view = (id: string, over: Record<string, unknown> = {}) => ({
  id, databaseId: "sys:my-pages", name: id, type: "table", filters: [], filterConjunction: "and",
  sorts: [], visibleProperties: ["title"], settings: {}, ...over,
});
type Call = { method: string; path: string; body?: unknown };
const transport = (answer: unknown, fail?: { status: number }) => {
  const calls: Call[] = [];
  const reply = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (fail) throw Object.assign(new Error("failed"), fail);
    return answer;
  };
  return {
    calls,
    get: (path: string) => reply("GET", path),
    put: (path: string, body: unknown) => reply("PUT", path, body),
    delete: (path: string) => reply("DELETE", path),
  };
};

test("diffViews never reports the default view, saved or removed", () => {
  const onlyDefault = { [DEFAULT_ID]: view(DEFAULT_ID) };
  assert.deepEqual(views.diffViews(onlyDefault, undefined, DEFAULT_ID), { saved: [], removed: [] });
  assert.deepEqual(views.diffViews({}, onlyDefault, DEFAULT_ID), { saved: [], removed: [] });
  assert.deepEqual(views.diffViews({ [DEFAULT_ID]: view(DEFAULT_ID, { name: "renamed" }) }, onlyDefault, DEFAULT_ID), { saved: [], removed: [] });
});

test("diffViews saves a new or changed view and removes a missing one", () => {
  const a = view("v-a");
  const before = { [DEFAULT_ID]: view(DEFAULT_ID), "v-a": a, "v-gone": view("v-gone") };
  const after = { [DEFAULT_ID]: view(DEFAULT_ID), "v-a": view("v-a", { sorts: [{ property: "title" }] }), "v-new": view("v-new") };
  const diff = views.diffViews(after, before, DEFAULT_ID);
  assert.deepEqual(diff.saved.map(([id]: [string]) => id).sort(), ["v-a", "v-new"]);
  assert.deepEqual(diff.removed, ["v-gone"]);
  assert.deepEqual(views.diffViews(before, before, DEFAULT_ID), { saved: [], removed: [] }, "unchanged map: nothing to do");
});

test("diffViews is idempotent and ignores key order", () => {
  const next = { "v-a": view("v-a", { settings: { showRowNumbers: true, wrapContent: true } }) };
  const reordered = { "v-a": view("v-a", { settings: { wrapContent: true, showRowNumbers: true } }) };
  assert.deepEqual(views.diffViews(next, reordered, DEFAULT_ID), { saved: [], removed: [] }, "a server round trip reorders keys");
  assert.deepEqual(views.diffViews(next, undefined, DEFAULT_ID), views.diffViews(next, undefined, DEFAULT_ID));
});

test("diffViews takes only views: a map of pages cannot enter it", () => {
  const withRows = { "v-a": view("v-a"), pages: { p1: { id: "p1" } } } as never;
  const saved = views.diffViews(withRows, { "v-a": view("v-a") }, DEFAULT_ID).saved.map(([id]: [string]) => id);
  assert.deepEqual(saved.filter((id: string) => id !== "pages"), [], "the diff reports no change in the real view");
});

test("fetchSavedViews rebuilds id and databaseId from the key and the source", async () => {
  const stored = { name: "Recent", type: "table", filters: [], sorts: [], visibleProperties: ["title"], settings: {} };
  const t = transport({ ok: true, source: "my-pages", views: { "v-a": stored } });
  const result = await views.fetchSavedViews("my-pages", t);
  assert.deepEqual(t.calls, [{ method: "GET", path: "/api/account/self-data/views/my-pages", body: undefined }]);
  assert.equal(result["v-a"].id, "v-a");
  assert.equal(result["v-a"].databaseId, "sys:my-pages");
  assert.equal(result["v-a"].name, "Recent");
});

test("fetchSavedViews tolerates a 404, throws on other errors, and ignores a garbled answer", async () => {
  assert.deepEqual({ ...await views.fetchSavedViews("my-pages", transport(null, { status: 404 })) }, {});
  await assert.rejects(() => views.fetchSavedViews("my-pages", transport(null, { status: 500 })));
  assert.deepEqual({ ...await views.fetchSavedViews("my-pages", transport({ ok: true, rows: [] })) }, {});
  assert.deepEqual({ ...await views.fetchSavedViews("my-pages", transport({ views: [1, 2] })) }, {});
});

test("fetchSavedViews never lets a __proto__ key from the server reach Object.prototype", async () => {
  const hostile = JSON.parse('{"ok":true,"views":{"__proto__":{"name":"x","polluted":true},"v-a":{"name":"ok"}}}');
  const result = await views.fetchSavedViews("my-pages", transport(hostile));
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  assert.deepEqual(Object.keys(result), ["v-a"]);
});

test("saveSavedView PUTs the view without id and databaseId, on a null-prototype body", async () => {
  const t = transport({ ok: true, views: { "v-a": { name: "A", type: "table" } } });
  const result = await views.saveSavedView("my-pages", "v-a", view("v-a", { name: "A" }), t);
  const call = t.calls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.path, "/api/account/self-data/views/my-pages/v-a");
  const body = call.body as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(body), null, "the patch is a null-prototype object");
  assert.equal("id" in body, false);
  assert.equal("databaseId" in body, false);
  assert.equal(body.name, "A");
  assert.equal(result["v-a"].databaseId, "sys:my-pages");
});

test("a hostile view id leaves Object.prototype alone", async () => {
  const t = transport({ ok: true, views: {} });
  await views.saveSavedView("my-pages", "__proto__", view("x", { polluted: true }), t);
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  assert.equal(Object.getPrototypeOf(t.calls[0].body), null);
});

test("deleteSavedView DELETEs one view id and returns the rest", async () => {
  const t = transport({ ok: true, views: { "v-b": { name: "B" } } });
  const result = await views.deleteSavedView("my-pages", "v-a", t);
  assert.deepEqual(t.calls, [{ method: "DELETE", path: "/api/account/self-data/views/my-pages/v-a", body: undefined }]);
  assert.deepEqual(Object.keys(result), ["v-b"]);
});
