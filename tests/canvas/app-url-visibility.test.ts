/* app-url-visibility.test.ts — empty URL => surface hidden; set URL => shown */

import assert from "node:assert/strict";
import test from "node:test";

import { configuredUrlFor, isReachableUrl, resolveAppUrl } from "@/shared/config/appUrls";
import { effectiveLaunchUrl, isListableApp } from "@/features/marketplace/model/launchPolicy";
import { isTabRestorable, pruneUnrestorableTabs } from "@/widgets/workspace-grid/model/layoutSanitize";
import { isRailItemAvailable, RAIL_GROUPS } from "@/widgets/activity-rail/model/railItems";
import type { LayoutNode, WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

const PUBLIC_HOST = "osionos.example.net";
const embed = (pageId: string, url: string): WorkspaceTab => ({ tabId: `t-${pageId}`, pageId, workspaceId: "", kind: "embed", url });

test("resolveAppUrl: configured value wins even when empty; only absent falls back", () => {
  assert.equal(resolveAppUrl("", "http://dev:1"), "");
  assert.equal(resolveAppUrl("  https://m.example.net ", "http://dev:1"), "https://m.example.net");
  assert.equal(resolveAppUrl(undefined, "http://dev:1"), "http://dev:1");
  assert.equal(resolveAppUrl(undefined, ""), "");
});

test("isReachableUrl: empty hidden; loopback only reachable from loopback pages", () => {
  assert.equal(isReachableUrl("", PUBLIC_HOST), false);
  assert.equal(isReachableUrl("https://localhost:3001/", PUBLIC_HOST), false);
  assert.equal(isReachableUrl("http://127.0.0.1:3002", PUBLIC_HOST), false);
  assert.equal(isReachableUrl("https://localhost:3001/", "localhost"), true);
  assert.equal(isReachableUrl("https://mail.example.net", PUBLIC_HOST), true);
  assert.equal(isReachableUrl("/", PUBLIC_HOST), true);
});

test("marketplace launch policy: Desktop loopback hidden publicly, shown locally", () => {
  const url = "https://localhost:3001";
  assert.equal(effectiveLaunchUrl("osionos.desktop", url, PUBLIC_HOST), "");
  assert.equal(isListableApp("osionos.desktop", url, PUBLIC_HOST), false);
  assert.equal(effectiveLaunchUrl("osionos.desktop", url, "localhost"), url);
  assert.equal(isListableApp("osionos.desktop", url, "localhost"), true);
  assert.equal(isListableApp("osionos.desktop", "https://desktop.example.net", PUBLIC_HOST), true);
});

test("marketplace launch policy: native Draw keeps working with its catalogue URL", () => {
  assert.equal(isListableApp("osionos.draw", "https://localhost:3001", PUBLIC_HOST), true);
});

test("marketplace launch policy: an app with no launch URL stays listed", () => {
  assert.equal(isListableApp("acme.notes", "", PUBLIC_HOST), true);
});

test("configuredUrlFor: gated surfaces report their URL, others have no gate", () => {
  assert.equal(typeof configuredUrlFor("osionos.mail"), "string");
  assert.equal(configuredUrlFor("osionos.desktop"), null);
});

test("persisted tabs: unreachable embeds are dropped, others and reachable embeds stay", () => {
  assert.equal(isTabRestorable(embed("__app__x__", "https://localhost:3001"), PUBLIC_HOST), false);
  assert.equal(isTabRestorable(embed("__app__x__", "https://localhost:3001"), "localhost"), true);
  assert.equal(isTabRestorable(embed("__app__x__", "https://ok.example.net"), PUBLIC_HOST), true);
  assert.equal(isTabRestorable({ tabId: "h", pageId: "__home__", workspaceId: "", kind: "home" }, PUBLIC_HOST), true);
});

test("pruneUnrestorableTabs: active tab falls back to a survivor, splits recurse", () => {
  const bad = embed("__app__x__", "http://localhost:3002");
  const home: WorkspaceTab = { tabId: "h", pageId: "__home__", workspaceId: "", kind: "home" };
  const tree: LayoutNode = {
    type: "split", id: "s", direction: "row", sizes: [50, 50],
    children: [
      { type: "pane", id: "p1", tabs: [bad, home], activeTabId: bad.tabId },
      { type: "pane", id: "p2", tabs: [home], activeTabId: home.tabId },
    ],
  };
  const out = pruneUnrestorableTabs(tree, PUBLIC_HOST);
  assert.equal(out.type, "split");
  const first = (out as { children: { tabs: WorkspaceTab[]; activeTabId: string | null }[] }).children[0];
  assert.deepEqual(first.tabs, [home]);
  assert.equal(first.activeTabId, "h");
  assert.deepEqual(pruneUnrestorableTabs(tree, "localhost"), tree);
});

test("rail: panel items always available; embedded-app items follow their configured URL", () => {
  const items = RAIL_GROUPS.flatMap((g) => g.items);
  for (const item of items.filter((i) => i.action.kind === "panel")) assert.equal(isRailItemAvailable(item), true);
  const mail = items.find((i) => i.id === "mail");
  assert.ok(mail);
  assert.equal(isRailItemAvailable(mail), (configuredUrlFor("osionos.mail") ?? "") !== "");
});
