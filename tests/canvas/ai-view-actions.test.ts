/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-view-actions.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The assistant's view actions (devil C211, C212): each one calls exactly the
 * store function it names, a value outside the allowlist changes nothing, and a
 * live `tool.result` applies once per tool call — a replayed frame (a reconnect
 * with Last-Event-ID) and a failed call never do.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import type { RunEventActions } from "@/features/chat/model/runEventDispatch";


const PAGE = "00000001-0000-4000-8000-000000000000";

/** Replaces the layout and panel actions with recorders. */
async function recordStores() {
  const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
  const { useUIStore } = await import("@/shared/config/uiStore");
  const calls: string[] = [];
  useWorkspaceLayout.setState({
    root: { type: "pane", id: "p1", tabs: [], activeTabId: null },
    activePaneId: "p1",
    openTab: (tab: WorkspaceTab, paneId?: string) => void calls.push(`openTab:${tab.pageId}:${paneId}`),
    splitWith: (paneId: string, direction: string, tab: WorkspaceTab, side: string) =>
      void calls.push(`split:${paneId}:${direction}:${tab.pageId}:${side}`),
    replaceTabWith: (paneId: string, tabId: string, tab: WorkspaceTab) => void calls.push(`replace:${paneId}:${tabId}:${tab.pageId}`),
  });
  useUIStore.setState({ expandToPanel: (panel?: string) => void calls.push(`panel:${panel}`) } as never);
  return calls;
}

const noActions: RunEventActions = {
  appendText: () => undefined,
  appendCitation: () => undefined,
  appendToolCall: () => undefined,
  appendToolResult: () => undefined,
  appendToolSource: () => undefined,
  patchAssistant: () => undefined,
  applyServerTitle: () => undefined,
  askPermission: () => undefined,
  proposeMemory: () => undefined,
};

test("open_page opens a tab, a split, or the current tab of an empty pane", async () => {
  const calls = await recordStores();
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  assert.equal(applyViewAction({ action: "open_page", pageId: PAGE, title: "Plan", target: "tab" }), true);
  assert.equal(applyViewAction({ action: "open_page", pageId: PAGE, title: "Plan", target: "split" }), true);
  assert.equal(applyViewAction({ action: "open_page", pageId: PAGE, title: "Plan", target: "current" }), true);
  assert.deepEqual(calls, [`openTab:${PAGE}:p1`, `split:p1:row:${PAGE}:after`, `openTab:${PAGE}:p1`]);
});

test("open_page replaces the active tab of a pane that has one", async () => {
  const calls = await recordStores();
  const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
  const open: WorkspaceTab = { tabId: "t1", pageId: "x", workspaceId: "ws", kind: "page", title: "Old" };
  useWorkspaceLayout.setState({ root: { type: "pane", id: "p1", tabs: [open], activeTabId: "t1" } });
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  applyViewAction({ action: "open_page", pageId: PAGE, title: "Plan", target: "current" });
  assert.deepEqual(calls, [`replace:p1:t1:${PAGE}`]);
});

test("a value outside the allowlist changes nothing", async () => {
  const calls = await recordStores();
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  assert.equal(applyViewAction({ action: "open_panel", panel: "https://x" }), false);
  assert.equal(applyViewAction({ action: "navigate", url: "https://x" }), false);
  assert.equal(applyViewAction({ action: "open_page", pageId: "../admin", title: "x", target: "tab" }), false);
  assert.equal(applyViewAction({ action: "open_page", pageId: PAGE, title: "x", target: "window" }), false);
  assert.equal(applyViewAction(null), false);
  assert.deepEqual(calls, []);
  assert.equal(applyViewAction({ action: "open_panel", panel: "search" }), true);
  assert.deepEqual(calls, ["panel:search"]);
});

test("open_issue_report fills the report request", async () => {
  await recordStores();
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  const { useIssueReportRequest } = await import("@/features/issues/model/issueReportRequest");
  assert.equal(applyViewAction({ action: "open_issue_report", title: "Blank page", description: "The page stays white." }), true);
  assert.deepEqual(useIssueReportRequest.getState().request, { title: "Blank page", description: "The page stays white." });
});

test("the same tool.result twice applies once; ok:false and an unlisted tool never apply", async () => {
  const calls = await recordStores();
  const { dispatchRunEvent } = await import("@/features/chat/model/runEventDispatch");
  const frame = { toolName: "open_panel", ok: true, toolCallId: "call-once", view: { action: "open_panel", panel: "tasks" } };
  dispatchRunEvent("tool.result", frame, noActions);
  dispatchRunEvent("tool.result", frame, noActions);
  dispatchRunEvent("tool.result", { ...frame, toolCallId: "call-failed", ok: false }, noActions);
  dispatchRunEvent("tool.result", { ...frame, toolCallId: "call-other", toolName: "read_page" }, noActions);
  assert.deepEqual(calls, ["panel:tasks"]);
});
