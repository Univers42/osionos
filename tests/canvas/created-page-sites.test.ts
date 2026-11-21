/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   created-page-sites.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The call sites that await a create and then open the page (#339) must leave a user
// who moved meanwhile where they are: a background tab and a toast, no takeover.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import "./support/memory-local-storage.ts";

import type { PageEntry } from "@/entities/page";
import type { PaneNode, WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

const WORKSPACE = "ws";
const { useUserStore } = await import("@/features/auth/model/useUserStore");
const { usePageStore } = await import("@/store/usePageStore");
const { derivePageState } = await import("@/store/pageStore.helpers");
const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
const { useUIStore } = await import("@/shared/config/uiStore");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");
const { createLibraryPage } = await import("@/widgets/database-view/model/libraryItems");
const { ensureWorkspaceGalleryPage } = await import("@/widgets/database-view/model/workspaceDatabasePage");
const { saveResearchPage } = await import("@/features/chat/model/saveResearchPage");

function tab(tabId: string, pageId: string): WorkspaceTab {
  return { tabId, pageId, workspaceId: WORKSPACE, kind: "page", title: pageId };
}

function entry(id: string): PageEntry {
  return { _id: id, title: id, workspaceId: WORKSPACE, ownerId: "owner", visibility: "private", content: [] };
}

function activePane(): PaneNode {
  return useWorkspaceLayout.getState().root as PaneNode;
}

// The create resolves only after the user switched to tab "tb"; that is the round trip.
function slowCreate(): void {
  usePageStore.setState({
    addPage: async () => {
      useWorkspaceLayout.getState().setActiveTab("p1", "tb");
      return entry("created");
    },
    addDatabasePage: async () => {
      useWorkspaceLayout.getState().setActiveTab("p1", "tb");
      return entry("created");
    },
  });
}

function assertBackgroundTab(): void {
  assert.equal(activePane().activeTabId, "tb");
  assert.deepEqual(activePane().tabs.map((candidate) => candidate.pageId), ["a", "b", "created"]);
  assert.notEqual(usePageStore.getState().activePage?.id, "created");
  assert.equal(useToastStore.getState().toasts[0]?.action?.label, "Open");
}

beforeEach(() => {
  const workspace = { _id: WORKSPACE, name: "W", ownerId: "owner", members: [], settings: {} };
  useUserStore.setState({
    sessions: { owner: { userId: "owner", accessToken: "", refreshToken: "", privateWorkspaces: [workspace], sharedWorkspaces: [] } as never },
    activeUserId: "owner", activeWorkspaceByUser: { owner: WORKSPACE },
  });
  const state = usePageStore.getState();
  usePageStore.setState({ ...derivePageState({ [WORKSPACE]: [entry("a"), entry("b"), entry("created")] }, state), activePage: null, recents: [] });
  useWorkspaceLayout.setState({ root: { type: "pane", id: "p1", tabs: [tab("ta", "a"), tab("tb", "b")], activeTabId: "ta" }, activePaneId: "p1", scope: "" });
  useUIStore.setState({ activePanel: "files" });
  useToastStore.setState({ toasts: [] });
  slowCreate();
});

test("createLibraryPage: a moved user gets a background tab", async () => {
  await createLibraryPage();
  assertBackgroundTab();
});

test("ensureWorkspaceGalleryPage: a moved user gets a background tab", async () => {
  await ensureWorkspaceGalleryPage();
  assertBackgroundTab();
});

test("saveResearchPage: a moved user gets a background tab", async () => {
  const result = await saveResearchPage({ report: "r", question: "q", parts: undefined });
  assert.equal(result.ok, true);
  assertBackgroundTab();
});

test("createLibraryPage: a user who stayed still gets the page", async () => {
  usePageStore.setState({ addPage: async () => entry("created") });
  await createLibraryPage();
  assert.equal(usePageStore.getState().activePage?.id, "created");
});
