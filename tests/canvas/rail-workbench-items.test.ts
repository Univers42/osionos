/* ************************************************************************** */
/*  rail-workbench-items.test.ts — the activity-rail top group and its workbench panels */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { ActivePanel } from "../../src/shared/config/uiStore.ts";
import {
  RAIL_ITEMS,
  RAIL_TOP_ITEMS,
  RAIL_WORKBENCH_ITEMS,
} from "../../src/widgets/activity-rail/model/railItems.ts";

const WORKBENCH_PANELS: ActivePanel[] = ["scm", "run", "problems"];

test("RAIL_ITEMS is the top items followed by the workbench items", () => {
  assert.equal(RAIL_ITEMS.length, RAIL_TOP_ITEMS.length + RAIL_WORKBENCH_ITEMS.length);
  assert.deepEqual(
    RAIL_ITEMS.slice(RAIL_TOP_ITEMS.length).map((item) => item.id),
    ["scm", "run", "problems"],
  );
});

test("every workbench rail item is a panel action on a workbench panel", () => {
  assert.deepEqual(
    RAIL_WORKBENCH_ITEMS.map((item) => item.action),
    WORKBENCH_PANELS.map((panel) => ({ kind: "panel", panel })),
  );
});
