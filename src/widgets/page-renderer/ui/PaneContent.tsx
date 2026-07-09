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

import { ErrorBoundary, LoadingPane } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import { tabToActivePage } from "@/widgets/workspace-grid/model/layoutSync";
import { HomeTabView } from "./HomeTabView";
import { FolderTabView } from "./FolderTabView";
import {
  LazyAgentConversationPage,
  LazyBaasConsoleView,
  LazyChannelMessagesView,
  LazyCollabBrowseView,
  LazyCommunityList,
  LazyDatabaseBlock,
  LazyEmbedAppView,
  LazyMessagesView,
  LazyAdminSpaceView,
  LazyChatShell,
  LazyOsionosPage,
  LazyProfilePageView,
  LazyTrashView,
  LazyWorkspaceDatabaseBlock,
} from "./lazyViews";
// Deep path, NOT the barrel: `@/widgets/database-view` has a side-effect
// `import './model/dataSourceProvider'` that pulls knownDatabaseState (and its
// ~458KB seed JSON) onto this warm pane path. The constants module is leaf-pure.
import { WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "@/widgets/database-view/model/workspaceDatabaseConstants";

/** A page tab: lazily fetch its content, then render agent or osionos view.
 *  EVERY pane mounts its own live, editable editor so several files can be edited
 *  side by side. The editor is fully keyed by pageId and, because we pass
 *  activePageRef, the pane does NOT subscribe to the global activePage
 *  (NotionPage), so panes stay isolated: typing in one persists to that pane's
 *  page and does not re-render the others. Background panes stay cheap via
 *  PaneView's serial idle-mount + `contain: layout paint` isolation. */
const PageTabView: React.FC<{ tab: WorkspaceTab; paneId?: string }> = ({ tab }) => {
  const page = usePageStore((s) => s.pageById(tab.pageId));
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");

  useEffect(() => {
    if (!page && jwt) fetchPageContent(tab.pageId, jwt);
  }, [page, jwt, tab.pageId, fetchPageContent]);

  if (!page) return <LoadingPane />;
  if (page.surface === "agent") {
    return <div className="h-full overflow-hidden"><LazyAgentConversationPage pageId={tab.pageId} /></div>;
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
    // The workspace database renders through WorkspaceDatabaseBlock (live page-store
    // adapter + record peek + the templates "New" button); other databases use the
    // raw block. This keeps the templates feature consistent with the ?home=database
    // home variant.
    const isWorkspaceDb = tab.databaseId === WS_FILES_DB_ID || tab.databaseId === WS_FOLDERS_DB_ID;
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-auto bg-[var(--osio-bg-page)]">
            {isWorkspaceDb ? (
              <LazyWorkspaceDatabaseBlock databaseId={tab.databaseId ?? WS_FILES_DB_ID} mode="full" chrome="full" />
            ) : (
              <LazyDatabaseBlock databaseId={tab.databaseId ?? tab.pageId} initialViewId={tab.viewId ?? undefined} mode="full" />
            )}
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
            <LazyProfilePageView userId={tab.pageId} />
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

  if (tab.kind === "admin") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]">
            <LazyAdminSpaceView />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "chat") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]"><LazyChatShell /></div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "messages") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]"><LazyMessagesView /></div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "collab") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-auto bg-[var(--osio-bg-page)]"><LazyCollabBrowseView /></div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "community") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]"><LazyCommunityList /></div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (tab.kind === "channel" || tab.kind === "group") {
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

  if (tab.kind === "embed") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="h-full overflow-hidden bg-[var(--osio-bg-page)]">
            <LazyEmbedAppView url={tab.url ?? ""} title={tab.title ?? ""} />
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
