/* ************************************************************************** */
/*  rail-workbench-items.test.ts — flag-gated activity-rail group + panel map  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { ActivePanel } from "../../src/shared/config/uiStore.ts";
import {
  RAIL_TOP_ITEMS,
  RAIL_WORKBENCH_ITEMS,
  railTopItems,
  visiblePanel,
} from "../../src/widgets/activity-rail/model/railItems.ts";

const WORKBENCH_PANELS: ActivePanel[] = ["scm", "run", "problems"];
const OTHER_PANELS: ActivePanel[] = [
  "files", "search", "marketplace", "agents", "messenger",
  "notifications", "tasks", "public", "database",
];

test("railTopItems(false) returns RAIL_TOP_ITEMS by identity", () => {
  assert.equal(railTopItems(false), RAIL_TOP_ITEMS);
});

test("railTopItems(true) appends the three workbench ids in order", () => {
  const items = railTopItems(true);
  assert.equal(items.length, RAIL_TOP_ITEMS.length + 3);
  assert.deepEqual(
    items.slice(RAIL_TOP_ITEMS.length).map((item) => item.id),
    ["scm", "run", "problems"],
  );
});

test("every workbench rail item is a panel action on a workbench panel", () => {
  assert.deepEqual(
    RAIL_WORKBENCH_ITEMS.map((item) => item.action),
    WORKBENCH_PANELS.map((panel) => ({ kind: "panel", panel })),
  );
});

test("visiblePanel maps the workbench panels to files when the flag is off", () => {
  for (const panel of WORKBENCH_PANELS) {
    assert.equal(visiblePanel(panel, false), "files");
  }
});

test("visiblePanel keeps the workbench panels when the flag is on", () => {
  for (const panel of WORKBENCH_PANELS) {
    assert.equal(visiblePanel(panel, true), panel);
  }
});

test("visiblePanel leaves every other panel unchanged in both flag states", () => {
  for (const panel of OTHER_PANELS) {
    assert.equal(visiblePanel(panel, false), panel);
    assert.equal(visiblePanel(panel, true), panel);
  }
});
