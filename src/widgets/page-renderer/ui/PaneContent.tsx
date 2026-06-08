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
import { HomeTabView } from "./HomeTabView";
import { FolderTabView } from "./FolderTabView";
import {
  LazyAgentConversationPage,
  LazyChannelMessagesView,
  LazyDatabaseBlock,
  LazyOsionosPage,
  LazyTrashView,
} from "./lazyViews";

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
  </div>
);

/** A page tab: lazily fetch its content, then render agent or osionos view. */
const PageTabView: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => {
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
export const PaneContent: React.FC<{ tab: WorkspaceTab; paneId?: string }> = ({ tab, paneId }) => {
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
        <PageTabView tab={tab} />
      </Suspense>
    </ErrorBoundary>
  );
};
