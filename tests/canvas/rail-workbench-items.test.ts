/* ************************************************************************** */
/*  rail-workbench-items.test.ts — the activity rail's Workbench group        */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { ActivePanel } from "../../src/shared/config/uiStore.ts";
import { RAIL_GROUPS } from "../../src/widgets/activity-rail/model/railItems.ts";

const WORKBENCH_PANELS: ActivePanel[] = ["scm", "run", "problems"];

test("the Workbench group sits right after Workspace", () => {
  assert.deepEqual(RAIL_GROUPS.map((group) => group.id), ["workspace", "workbench", "conversations", "apps"]);
});

test("every workbench rail item is a panel action on a workbench panel", () => {
  const workbench = RAIL_GROUPS.find((group) => group.id === "workbench");
  assert.deepEqual(
    workbench?.items.map((item) => item.action),
    WORKBENCH_PANELS.map((panel) => ({ kind: "panel", panel })),
  );
});
