/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   created-page-open.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page create that resolves after the user moved must not take over what they
// now look at (#339): it lands as a background tab and says so with a toast.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import "./support/memory-local-storage.ts";

import type { ActivePage, PageEntry } from "@/entities/page";
import type { PaneNode, WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

const WORKSPACE = "ws";
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({
    activeSession: () => ({ userId: "owner", privateWorkspaces: [{ _id: WORKSPACE }], sharedWorkspaces: [] }),
    activeJwt: () => null,
    activePageJwt: () => null,
  }),
  subscribe: () => () => undefined,
});

const { usePageStore } = await import("@/store/usePageStore");
const { derivePageState } = await import("@/store/pageStore.helpers");
const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
const { useUIStore } = await import("@/shared/config/uiStore");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");
const { captureOpenOrigin, openCreatedPage } = await import("@/widgets/workspace-grid/model/createdPageOpen");

const CREATED: ActivePage = { id: "created", workspaceId: WORKSPACE, kind: "page", title: "Untitled" };

function pageTab(tabId: string, pageId: string): WorkspaceTab {
  return { tabId, pageId, workspaceId: WORKSPACE, kind: "page", title: pageId };
}

function pane(id: string, tabs: WorkspaceTab[]): PaneNode {
  return { type: "pane", id, tabs, activeTabId: tabs[0]?.tabId ?? null };
}

function entry(id: string): PageEntry {
  return { _id: id, title: id, workspaceId: WORKSPACE, ownerId: "owner", visibility: "private", content: [] };
}

function paneById(id: string): PaneNode | undefined {
  const root = useWorkspaceLayout.getState().root;
  const panes = root.type === "pane" ? [root] : root.children.filter((child): child is PaneNode => child.type === "pane");
  return panes.find((candidate) => candidate.id === id);
}

beforeEach(() => {
  const state = usePageStore.getState();
  usePageStore.setState({ ...derivePageState({ [WORKSPACE]: [entry("a"), entry("b"), entry("created")] }, state), activePage: null, recents: [] });
  useWorkspaceLayout.setState({ root: pane("p1", [pageTab("ta", "a"), pageTab("tb", "b")]), activePaneId: "p1", scope: "" });
  useUIStore.setState({ activePanel: "files" });
  useToastStore.setState({ toasts: [] });
});

test("origin unchanged: the page opens and takes focus, as before", () => {
  const origin = captureOpenOrigin();
  openCreatedPage(CREATED, origin);
  const p1 = paneById("p1");
  assert.equal(usePageStore.getState().activePage?.id, "created");
  assert.equal(p1?.tabs.find((tab) => tab.tabId === p1.activeTabId)?.pageId, "created");
  assert.equal(useToastStore.getState().toasts.length, 0);
});

test("active tab changed in the same pane: a background tab, nothing else moves", () => {
  const origin = captureOpenOrigin();
  useWorkspaceLayout.getState().setActiveTab("p1", "tb");
  const activePage = usePageStore.getState().activePage;
  openCreatedPage(CREATED, origin);
  const p1 = paneById("p1");
  assert.equal(useWorkspaceLayout.getState().activePaneId, "p1");
  assert.equal(p1?.activeTabId, "tb");
  assert.deepEqual(p1?.tabs.map((tab) => tab.pageId), ["a", "b", "created"]);
  assert.equal(usePageStore.getState().activePage, activePage);
  const toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "Page created");
  assert.equal(toasts[0].action?.label, "Open");
  toasts[0].action?.onClick();
  assert.equal(usePageStore.getState().activePage?.id, "created");
  assert.equal(paneById("p1")?.tabs.length, 3, "Open focuses the background tab, it adds no second one");
});

test("origin pane closed: the background tab lands in the active pane", () => {
  useWorkspaceLayout.setState({
    root: { type: "split", id: "s", direction: "row", sizes: [50, 50], children: [pane("p1", [pageTab("ta", "a")]), pane("p2", [pageTab("tb", "b")])] },
    activePaneId: "p1",
  });
  const origin = captureOpenOrigin();
  useWorkspaceLayout.getState().closePane("p1");
  const activePage = usePageStore.getState().activePage;
  openCreatedPage(CREATED, origin);
  const p2 = paneById("p2") ?? (useWorkspaceLayout.getState().root as PaneNode);
  assert.equal(useWorkspaceLayout.getState().activePaneId, "p2");
  assert.equal(p2.activeTabId, "tb");
  assert.deepEqual(p2.tabs.map((tab) => tab.pageId), ["b", "created"]);
  assert.equal(usePageStore.getState().activePage, activePage);
  assert.equal(useToastStore.getState().toasts.length, 1);
});

test("rail view changed: no takeover", () => {
  const origin = captureOpenOrigin();
  useUIStore.getState().setActivePanel("search");
  openCreatedPage(CREATED, origin);
  assert.equal(usePageStore.getState().activePage, null);
  assert.equal(paneById("p1")?.activeTabId, "ta");
  assert.equal(useUIStore.getState().activePanel, "search");
  assert.deepEqual(paneById("p1")?.tabs.map((tab) => tab.pageId), ["a", "b", "created"]);
  assert.equal(useToastStore.getState().toasts[0]?.title, "Page created");
});

test("another layout scope (user or workspace switch): no tab in it, the toast only", () => {
  const origin = captureOpenOrigin();
  useWorkspaceLayout.setState({ root: pane("q1", [pageTab("tq", "b")]), activePaneId: "q1", scope: "user:other-ws" });
  openCreatedPage(CREATED, origin);
  assert.deepEqual(paneById("q1")?.tabs.map((tab) => tab.pageId), ["b"]);
  assert.equal(usePageStore.getState().activePage, null);
  const toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].action, undefined);
});

test("open: false opens nothing", () => {
  const origin = captureOpenOrigin(false);
  openCreatedPage(CREATED, origin);
  assert.equal(origin, null);
  assert.equal(usePageStore.getState().activePage, null);
  assert.deepEqual(paneById("p1")?.tabs.map((tab) => tab.pageId), ["a", "b"]);
  assert.equal(useToastStore.getState().toasts.length, 0);
});
