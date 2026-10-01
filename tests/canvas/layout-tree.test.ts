/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-tree.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/01 17:44:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/01 17:44:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Unit tests for the pure layout-tree operations that power the VSCode-style
// pane system. Every pane open/close/split/focus flows through these functions;
// 10 modules import them and none had a safety net until now.

import assert from "node:assert/strict";
import test from "node:test";

import {
  genId,
  findPane,
  collectPanes,
  updatePane,
  findOpenTab,
  activeTabOf,
  type PaneNode,
  type SplitNode,
  type LayoutNode,
  type WorkspaceTab,
} from "../../src/widgets/workspace-grid/model/layoutTree.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkTab(pageId: string, tabId?: string): WorkspaceTab {
  return {
    tabId: tabId ?? `tab-${pageId}`,
    pageId,
    workspaceId: "ws-1",
    kind: "page",
  };
}

function mkPane(id: string, tabs: WorkspaceTab[] = [], activeTabId: string | null = null): PaneNode {
  return { type: "pane", id, tabs, activeTabId };
}

function mkSplit(id: string, direction: "row" | "column", children: LayoutNode[]): SplitNode {
  return { type: "split", id, direction, children, sizes: children.map(() => 100 / children.length) };
}

// Reusable trees ──────────────────────────────────────────────────────────────

const tabA = mkTab("page-a", "t-a");
const tabB = mkTab("page-b", "t-b");
const tabC = mkTab("page-c", "t-c");
const tabD = mkTab("page-d", "t-d");

const paneL = mkPane("pane-L", [tabA, tabB], "t-a");
const paneR = mkPane("pane-R", [tabC], "t-c");
const paneDeep = mkPane("pane-deep", [tabD], "t-d");

/** Simple two-pane row split. */
const twoPane: SplitNode = mkSplit("split-root", "row", [paneL, paneR]);

/** Three levels: split → split → pane. */
const deepTree: SplitNode = mkSplit("split-root", "row", [
  paneL,
  mkSplit("split-inner", "column", [paneR, paneDeep]),
]);

// ---------------------------------------------------------------------------
// genId
// ---------------------------------------------------------------------------

test("genId: returns string starting with the given prefix", () => {
  const id = genId("pane");
  assert.ok(id.startsWith("pane-"), `expected "${id}" to start with "pane-"`);
});

test("genId: consecutive calls produce unique IDs", () => {
  const ids = new Set(Array.from({ length: 50 }, () => genId("x")));
  assert.equal(ids.size, 50);
});

test("genId: format matches prefix-counter-random pattern", () => {
  const id = genId("tab");
  // tab-<digits>-<alphanumeric 5 chars>
  assert.match(id, /^tab-\d+-[a-z0-9]{5}$/);
});

// ---------------------------------------------------------------------------
// findPane
// ---------------------------------------------------------------------------

test("findPane: returns the pane when it's a direct leaf match", () => {
  const result = findPane(paneL, "pane-L");
  assert.equal(result, paneL);
});

test("findPane: finds a pane nested inside a split", () => {
  const result = findPane(twoPane, "pane-R");
  assert.equal(result, paneR);
});

test("findPane: finds a deeply nested pane (3 levels)", () => {
  const result = findPane(deepTree, "pane-deep");
  assert.equal(result, paneDeep);
});

test("findPane: returns null when pane ID doesn't exist", () => {
  assert.equal(findPane(deepTree, "ghost"), null);
});

test("findPane: returns null for a leaf that doesn't match", () => {
  assert.equal(findPane(paneL, "pane-R"), null);
});

// ---------------------------------------------------------------------------
// collectPanes
// ---------------------------------------------------------------------------

test("collectPanes: returns single pane when root is a pane", () => {
  const result = collectPanes(paneL);
  assert.deepEqual(result, [paneL]);
});

test("collectPanes: collects panes left-to-right from a row split", () => {
  const result = collectPanes(twoPane);
  assert.deepEqual(result, [paneL, paneR]);
});

test("collectPanes: collects panes from a nested tree (depth 3)", () => {
  const result = collectPanes(deepTree);
  assert.deepEqual(result, [paneL, paneR, paneDeep]);
});

test("collectPanes: returns empty array from a split with no children", () => {
  const empty: SplitNode = mkSplit("empty", "row", []);
  assert.deepEqual(collectPanes(empty), []);
});

// ---------------------------------------------------------------------------
// updatePane
// ---------------------------------------------------------------------------

test("updatePane: updates a direct leaf pane", () => {
  const updated = updatePane(paneL, "pane-L", (p) => ({ ...p, activeTabId: "t-b" }));
  assert.equal(updated.type, "pane");
  assert.equal((updated as PaneNode).activeTabId, "t-b");
});

test("updatePane: updates a nested pane inside a split", () => {
  const updated = updatePane(twoPane, "pane-R", (p) => ({ ...p, activeTabId: null })) as SplitNode;
  const updatedR = updated.children[1] as PaneNode;
  assert.equal(updatedR.activeTabId, null);
  // Left pane untouched — same reference.
  assert.equal(updated.children[0], paneL);
});

test("updatePane: returns the same tree when paneId not found (identity)", () => {
  const result = updatePane(twoPane, "ghost", (p) => ({ ...p, activeTabId: null }));
  // Split node is reconstructed with new children array, but each child is the same ref.
  const resultSplit = result as SplitNode;
  assert.equal(resultSplit.children[0], paneL);
  assert.equal(resultSplit.children[1], paneR);
});

test("updatePane: preserves sibling panes unchanged (referential equality)", () => {
  const updated = updatePane(deepTree, "pane-deep", (p) => ({ ...p, activeTabId: null })) as SplitNode;
  // paneL is a direct child of root — should be same reference.
  assert.equal(updated.children[0], paneL);
  // paneR is inside the inner split — should be same reference.
  const inner = updated.children[1] as SplitNode;
  assert.equal(inner.children[0], paneR);
  // paneDeep was updated — different reference.
  assert.notEqual(inner.children[1], paneDeep);
});

test("updatePane: works on a deeply nested tree", () => {
  const updated = updatePane(deepTree, "pane-deep", (p) => ({
    ...p,
    tabs: [...p.tabs, mkTab("page-e", "t-e")],
  })) as SplitNode;
  const inner = updated.children[1] as SplitNode;
  const deep = inner.children[1] as PaneNode;
  assert.equal(deep.tabs.length, 2);
  assert.equal(deep.tabs[1].pageId, "page-e");
});

// ---------------------------------------------------------------------------
// findOpenTab
// ---------------------------------------------------------------------------

test("findOpenTab: finds a tab by pageId in a single pane", () => {
  const result = findOpenTab(paneL, "page-a");
  assert.ok(result);
  assert.equal(result.paneId, "pane-L");
  assert.equal(result.tab.tabId, "t-a");
});

test("findOpenTab: finds a tab across multiple panes", () => {
  const result = findOpenTab(twoPane, "page-c");
  assert.ok(result);
  assert.equal(result.paneId, "pane-R");
  assert.equal(result.tab.tabId, "t-c");
});

test("findOpenTab: returns the FIRST match when pageId appears in multiple panes", () => {
  // Create a tree where page-a exists in two panes.
  const dupePane = mkPane("pane-dupe", [mkTab("page-a", "t-a-dupe")], "t-a-dupe");
  const tree = mkSplit("root", "row", [paneL, dupePane]);
  const result = findOpenTab(tree, "page-a");
  assert.ok(result);
  assert.equal(result.paneId, "pane-L"); // first in left-to-right order
});

test("findOpenTab: returns null when pageId is not in any pane", () => {
  assert.equal(findOpenTab(deepTree, "page-ghost"), null);
});

test("findOpenTab: returns null when panes have no tabs", () => {
  const empty = mkPane("pane-empty", [], null);
  assert.equal(findOpenTab(empty, "anything"), null);
});

// ---------------------------------------------------------------------------
// activeTabOf
// ---------------------------------------------------------------------------

test("activeTabOf: returns the tab matching activeTabId", () => {
  const result = activeTabOf(twoPane, "pane-L");
  assert.ok(result);
  assert.equal(result.tabId, "t-a");
});

test("activeTabOf: falls back to first tab when activeTabId is null", () => {
  const pane = mkPane("p1", [mkTab("x", "tx"), mkTab("y", "ty")], null);
  const result = activeTabOf(pane, "p1");
  assert.ok(result);
  assert.equal(result.tabId, "tx");
});

test("activeTabOf: falls back to first pane when paneId not found", () => {
  // paneId "ghost" doesn't exist → falls back to first pane (paneL) → its active tab.
  const result = activeTabOf(twoPane, "ghost");
  assert.ok(result);
  assert.equal(result.tabId, "t-a"); // paneL's activeTabId
});

test("activeTabOf: returns null when tree has no panes", () => {
  const empty: SplitNode = mkSplit("empty", "row", []);
  assert.equal(activeTabOf(empty, "anything"), null);
});

test("activeTabOf: returns null when the only pane has no tabs", () => {
  const empty = mkPane("p-empty", [], null);
  assert.equal(activeTabOf(empty, "p-empty"), null);
});
