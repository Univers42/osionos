import assert from "node:assert/strict";
import { test } from "node:test";
import { hashForTab, tabTargetFromHash } from "../../src/features/page-link/tabUrl.ts";

// #259: a `#source=adapter&view=baas:<db>:Event#vg-types` link fell back to the home
// dashboard, and a page's URL named whichever of its tables mounted last.
const DB = "5d1bbdb5-f6d2-4d0f-83d0-3758309e20ec";
const PAGE = "cd1cb7ef-d5a6-4785-9c73-e38be3ea655f";
const WS = "dad07d44-c78d-4660-8738-81476982ab38";
const tab = (over: object) => ({ tabId: "t", pageId: PAGE, workspaceId: WS, kind: "page", ...over }) as never;

test("the reported link opens that database on that view", () => {
  const hash = `#source=adapter&view=baas%3A${DB}%3AEvent%23vg-types`;
  assert.deepEqual(tabTargetFromHash(hash), {
    kind: "database", databaseId: `baas:${DB}:Event`, viewId: `baas:${DB}:Event#vg-types`, title: "Event",
  });
});

test("a page tab round-trips through its URL", () => {
  assert.deepEqual(tabTargetFromHash(hashForTab(tab({}))), { kind: "page", pageId: PAGE, workspaceId: WS });
});

test("a database tab round-trips through its URL", () => {
  const viewId = `baas:${DB}:orders#vg-board`;
  const target = tabTargetFromHash(hashForTab(tab({ kind: "database", pageId: `baas:${DB}:orders`, viewId })));
  assert.equal(target?.kind === "database" && target.viewId, viewId);
});

test("home dashboards, garbage and surfaces with no address name nothing", () => {
  assert.equal(tabTargetFromHash("#source=adapter&view=my-workspaces-home-dashboard"), null);
  assert.equal(tabTargetFromHash("#page=not-a-uuid"), null);
  assert.equal(tabTargetFromHash(""), null);
  assert.equal(hashForTab(tab({ kind: "home", pageId: "home" })), "");
  assert.equal(hashForTab(null), "");
});
