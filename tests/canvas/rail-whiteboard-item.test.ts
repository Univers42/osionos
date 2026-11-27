import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { PenTool } from "lucide-react";

import { RAIL_GROUPS, visibleRailItems } from "../../src/widgets/activity-rail/model/railItems.ts";
import { whiteboardTab } from "../../src/widgets/workspace-grid/model/layoutPersist.ts";

const appsGroup = RAIL_GROUPS.find((group) => group.id === "apps");

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("the apps group has exactly one static Whiteboard item that opens its tab", () => {
  const items = RAIL_GROUPS.flatMap((group) => group.items).filter((item) => item.id === "whiteboard");
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Whiteboard");
  assert.equal(items[0].Icon, PenTool);
  assert.equal(items[0].action.kind === "workspaceTab" && items[0].action.makeTab, whiteboardTab);
  assert.ok(appsGroup?.items.includes(items[0]));
});

test("the Whiteboard icon is shown with no install state at all", () => {
  assert.ok(appsGroup);
  assert.ok(visibleRailItems(appsGroup).some((item) => item.id === "whiteboard"));
});

test("the osio.whiteboard kill-switch hides only the Whiteboard icon", () => {
  assert.ok(appsGroup);
  (globalThis as { window?: unknown }).window = { location: { search: "?osio.whiteboard=0", hash: "" }, localStorage: { getItem: () => null } };
  const ids = visibleRailItems(appsGroup).map((item) => item.id);
  assert.deepEqual(ids, appsGroup.items.map((item) => item.id).filter((id) => id !== "whiteboard"));
});

test("every other group shows all of its ungated items", () => {
  for (const group of RAIL_GROUPS.filter((candidate) => candidate.id !== "apps")) {
    const ungated = group.items.filter((item) => !item.isAvailable);
    assert.deepEqual(visibleRailItems(group).filter((item) => !item.isAvailable), ungated);
  }
});
