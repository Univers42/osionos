/* ************************************************************************** */
/*  rail-registry.test.ts — one rail entry per feature, active for its tab    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { RAIL_GROUPS, isRailItemActive, visibleRailItems, type RailItem } from "../../src/widgets/activity-rail/model/railItems.ts";
import { aiHubTab, consoleTab, mailTab, trashTab } from "../../src/widgets/workspace-grid/model/layoutPersist.ts";

const ALL = RAIL_GROUPS.flatMap((group) => group.items);
const item = (id: string): RailItem => {
  const found = ALL.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
};
const SHOWN = { activePanel: "files" as const, panelShown: true, activePageId: undefined };

test("every rail item either selects a panel or opens a tab: no third kind", () => {
  for (const entry of ALL) assert.ok(entry.action.kind === "panel" || entry.action.kind === "workspaceTab", entry.id);
});

test("item ids are unique across the rail", () => {
  assert.equal(new Set(ALL.map((entry) => entry.id)).size, ALL.length);
});

test("a panel item is active only while its panel is shown", () => {
  assert.equal(isRailItemActive(item("files"), SHOWN), true);
  assert.equal(isRailItemActive(item("files"), { ...SHOWN, panelShown: false }), false);
  assert.equal(isRailItemActive(item("search"), SHOWN), false);
});

test("a tab item is active while its tab is the focused one", () => {
  assert.equal(isRailItemActive(item("ai-hub"), { ...SHOWN, activePageId: aiHubTab().pageId }), true);
  assert.equal(isRailItemActive(item("ai-hub"), { ...SHOWN, activePageId: mailTab().pageId }), false);
  assert.equal(isRailItemActive(item("ai-hub"), SHOWN), false);
});

test("archived files is a rail entry of the workspace group, opening the trash tab", () => {
  const trash = item("trash");
  assert.ok(RAIL_GROUPS.find((group) => group.id === "workspace")?.items.includes(trash));
  assert.equal(trash.action.kind === "workspaceTab" && trash.action.makeTab().pageId, trashTab().pageId);
});

test("the BaaS console entry opens the console tab and hides without a configured project", () => {
  const console = item("console");
  assert.equal(console.action.kind === "workspaceTab" && console.action.makeTab().pageId, consoleTab().pageId);
  const group = RAIL_GROUPS.find((candidate) => candidate.items.includes(console));
  assert.ok(group);
  assert.ok(!visibleRailItems(group).includes(console));
});
