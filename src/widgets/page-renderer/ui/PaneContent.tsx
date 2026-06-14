/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PaneContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect } from "react";

import { ErrorBoundary } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import { tabToActivePage } from "@/widgets/workspace-grid/model/layoutSync";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { HomeTabView } from "./HomeTabView";
import { FolderTabView } from "./FolderTabView";
import { PageBlocksRenderer } from "./PageBlocksRenderer";
import {
  LazyAgentConversationPage,
  LazyBaasConsoleView,
  LazyChannelMessagesView,
  LazyDatabaseBlock,
  LazyOsionosPage,
  LazyProfileView,
  LazyTrashView,
} from "./lazyViews";

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
  </div>
);

/** A page tab: lazily fetch its content, then render agent or osionos view.
 *  Only the FOCUSED pane mounts the heavy editable editor; the other open panes
 *  render the cheap, already-virtualized read-only view (identical visuals, no
 *  edit machinery). Focusing a pane swaps it to the editor. This turns "8 live
 *  editors" — the dominant cost with many panes open — into "1 editor + N cheap
 *  views" (VSCode-style: inactive splits are lightweight). */
const PageTabView: React.FC<{ tab: WorkspaceTab; paneId?: string }> = ({ tab, paneId }) => {
  const page = usePageStore((s) => s.pageById(tab.pageId));
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  // No paneId → single-pane (non-grid) context: always the live editor.
  const isFocusedPane = useWorkspaceLayout((s) => !paneId || s.activePaneId === paneId);

  useEffect(() => {
    if (!page && jwt) fetchPageContent(tab.pageId, jwt);
  }, [page, jwt, tab.pageId, fetchPageContent]);

  if (!page) return <LoadingPane />;
  if (page.surface === "agent") {
    return <div className="h-full overflow-hidden"><LazyAgentConversationPage pageId={tab.pageId} /></div>;
  }
  if (!isFocusedPane) {
    // Cheap read-only preview for an unfocused split. `.osionos-page` is the scroll
    // container PageBlocksRenderer virtualizes against. Click anywhere focuses the
    // pane → activePaneId flips → this swaps to the live editor.
    return (
      <div className="osionos-page h-full overflow-auto bg-[var(--osio-bg-page)]">
        <div className="mx-auto w-full max-w-3xl px-12 py-10">
          {(page.icon || page.title) ? (
            <h1 className="mb-4 text-3xl font-bold text-[var(--osio-fg-default)]">
              {page.icon ? <span className="mr-2">{page.icon}</span> : null}{page.title}
            </h1>
          ) : null}
          <PageBlocksRenderer blocks={page.content ?? []} />
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-hidden">
      <LazyOsionosPage pageId={tab.pageId} activePageRef={tabToActivePage(tab)} />
    </div>
  );
};

/** Render the right view for one tab — the per-pane equivalent of MainContent. */
const PaneContentImpl: React.FC<{ tab: WorkspaceTab; paneId?: string }> = ({ tab, paneId }) => {
  if (tab.kind === "home") return <HomeTabView />;

  if (tab.kind === "folder") return <FolderTabView tab={tab} paneId={paneId} />;

  if (tab.kind === "trash") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-auto bg-[var(--osio-bg-page)]"><LazyTrashView /></div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "database") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-auto bg-[var(--osio-bg-page)]">
            <LazyDatabaseBlock databaseId={tab.databaseId ?? tab.pageId} mode="full" />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "profile") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]">
            <LazyProfileView userId={tab.pageId} />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "console") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]">
            <LazyBaasConsoleView />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "channel") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]">
            <LazyChannelMessagesView channelId={tab.pageId} workspaceId={tab.workspaceId} title={tab.title ?? ""} />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingPane />}>
        <PageTabView tab={tab} paneId={paneId} />
      </Suspense>
    </ErrorBoundary>
  );
};

// Memoized: a sibling pane gaining focus or a drag starting re-renders PaneView,
// but the tab/paneId here are stable per layout node, so this editor subtree is
// skipped — the dominant cost when 8 panes are open.
export const PaneContent = React.memo(PaneContentImpl);
