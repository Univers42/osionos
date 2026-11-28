/** A pane a split or a drop makes grows in once (PaneView data-pane-enter); a pane that already existed does not. */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
const { forgetFreshPane, isFreshPane } = await import("@/widgets/workspace-grid/model/freshPanes");

const tab = (id: string) => ({ tabId: `tab-${id}`, pageId: `page-${id}`, workspaceId: "ws", kind: "page" as const, title: id });

test("splitWith and splitMoveTab mark only the pane they create as fresh", () => {
  const layout = useWorkspaceLayout.getState();
  layout.openTab(tab("a"));
  const first = useWorkspaceLayout.getState().activePaneId;
  layout.openTab(tab("b"), first);

  useWorkspaceLayout.getState().splitWith(first, "row", tab("c"), "after");
  const split = useWorkspaceLayout.getState().activePaneId;
  assert.notEqual(split, first);
  assert.equal(isFreshPane(split), true);
  assert.equal(isFreshPane(first), false);
  forgetFreshPane(split);
  assert.equal(isFreshPane(split), false);

  useWorkspaceLayout.getState().splitMoveTab(first, "tab-b", first, "column", "after");
  const moved = useWorkspaceLayout.getState().activePaneId;
  assert.notEqual(moved, first);
  assert.equal(isFreshPane(moved), true);
});
