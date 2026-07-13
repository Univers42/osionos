/* ************************************************************************** */
/*  layout-close-pages.test.ts — pruneTabsForPages drops deleted-page tabs    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { pruneTabsForPages } from "../../src/widgets/workspace-grid/model/layoutMutations.ts";
import { collectPanes } from "../../src/widgets/workspace-grid/model/layoutTree.ts";
import type { LayoutNode, PaneNode, WorkspaceTab } from "../../src/widgets/workspace-grid/model/layoutTree.ts";

const tab = (pageId: string): WorkspaceTab => ({ tabId: `t-${pageId}`, pageId, workspaceId: "w1", kind: "page" });
const pane = (id: string, tabs: WorkspaceTab[], activeTabId = tabs[0]?.tabId ?? null): PaneNode =>
  ({ type: "pane", id, tabs, activeTabId });
const closes = (...ids: string[]) => (t: WorkspaceTab) => ids.includes(t.pageId);
const pageIdsOf = (root: LayoutNode): string[] => collectPanes(root).flatMap((p) => p.tabs.map((t) => t.pageId));

test("prunes the matching tab and keeps its siblings", () => {
  const result = pruneTabsForPages(pane("P", [tab("p1"), tab("p2"), tab("p3")]), "P", closes("p2"));
  assert.notEqual(result, null);
  assert.notEqual(result, "empty");
  if (result && result !== "empty") assert.deepEqual(pageIdsOf(result.root), ["p1", "p3"]);
});

test("closing the active tab re-points activeTabId to a survivor", () => {
  const result = pruneTabsForPages(pane("P", [tab("p1"), tab("p2"), tab("p3")], "t-p2"), "P", closes("p2"));
  if (result && result !== "empty") assert.equal(collectPanes(result.root)[0].activeTabId, "t-p3");
  else assert.fail("expected a pruned tree");
});

test("emptying the only pane reports \"empty\" (caller resets to Home)", () => {
  const result = pruneTabsForPages(pane("P", [tab("only")]), "P", closes("only"));
  assert.equal(result, "empty");
});

test("no matching tab → null (tree untouched)", () => {
  assert.equal(pruneTabsForPages(pane("P", [tab("keep")]), "P", closes("ghost")), null);
});

test("emptying one pane of a split collapses to the surviving pane", () => {
  const root: LayoutNode = {
    type: "split", id: "s1", direction: "row",
    children: [pane("A", [tab("a1")]), pane("B", [tab("b1"), tab("b2")])],
    sizes: [50, 50],
  };
  // close BOTH of pane B's tabs → B empties and is removed → tree collapses to pane A.
  const result = pruneTabsForPages(root, "B", closes("b1", "b2"));
  assert.notEqual(result, "empty");
  if (result && result !== "empty") {
    assert.deepEqual(pageIdsOf(result.root), ["a1"]);
    assert.equal(result.activePaneId, "A"); // removed active pane "B" falls to the survivor
  }
});
