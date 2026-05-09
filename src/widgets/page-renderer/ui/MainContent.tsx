/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 03:50:34 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect } from "react";

import { ErrorBoundary } from "@/shared/ui";
import { DatabaseBlock } from "@/widgets/database-view";
import {
  createViewShowcaseLayoutContent,
  getHomeDashboardPageId,
  HOME_DASHBOARD_PAGE_ICON,
  HOME_DASHBOARD_PAGE_TITLE,
} from "@/widgets/database-view/model/databaseViewCatalog";
import { ChannelMessagesView } from "@/widgets/channel-messages";
import { OsionosPage } from "@/pages/notion-page";
import { TrashView } from "@/pages/trash-view";

import { usePageStore } from "@/store/usePageStore";
import { savePagesCache } from "@/store/pageStore.helpers";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";

const HOME_DASHBOARD_VERSION = 3;

function createHomeDashboardPage(workspaceId: string, ownerId: string | null): PageEntry {
  return {
    _id: getHomeDashboardPageId(workspaceId),
    title: HOME_DASHBOARD_PAGE_TITLE,
    icon: HOME_DASHBOARD_PAGE_ICON,
    cover: "linear-gradient(135deg, color-mix(in srgb, #2563eb 20%, var(--osio-bg-page)) 0%, color-mix(in srgb, #0f766e 16%, var(--osio-bg-page)) 46%, color-mix(in srgb, #b45309 12%, var(--osio-bg-page)) 100%)",
    updatedAt: new Date().toISOString(),
    workspaceId,
    ownerId,
    visibility: "private",
    collaborators: [],
    parentPageId: null,
    databaseId: null,
    archivedAt: null,
    content: createViewShowcaseLayoutContent("full_page"),
    surface: "home",
    homeDashboardVersion: HOME_DASHBOARD_VERSION,
  };
}

/**
 * Renders the right-hand content panel.
 * Shows the editable home dashboard, DatabaseBlock, or the osionos-style page view.
 */
export const MainContent: React.FC = () => {
  const activePage = usePageStore((s) => s.activePage);
  const showTrash = usePageStore((s) => s.showTrash);
  const pageById = usePageStore((s) => s.pageById);
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const clearActivePage = usePageStore.setState;
  const session = useUserStore((s) => s.activeSession());
  const jwt = useUserStore((s) => s.activeJwt() ?? "");
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());

  const firstWsId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? "";
  const workspacePages = usePageStore((s) => firstWsId ? s.pages[firstWsId] ?? [] : []);
  const homeDashboardPageId = firstWsId ? getHomeDashboardPageId(firstWsId) : "";
  const homeDashboardPage = workspacePages.find((page) => page._id === homeDashboardPageId && !page.archivedAt);

  useEffect(() => {
    if (activePage || showTrash || !firstWsId) return;
    if (homeDashboardPage?.homeDashboardVersion === HOME_DASHBOARD_VERSION) return;

    const nextHomePage = createHomeDashboardPage(firstWsId, session?.userId ?? null);
    usePageStore.setState((state) => {
      const existingPages = state.pages[firstWsId] ?? [];
      const existingIndex = existingPages.findIndex((page) => page._id === nextHomePage._id && !page.archivedAt);

      if (existingIndex >= 0) {
        const existingHomePage = existingPages[existingIndex];
        if (existingHomePage.homeDashboardVersion === HOME_DASHBOARD_VERSION) return {};
        const migratedHomePage: PageEntry = {
          ...nextHomePage,
          title: existingHomePage.title || nextHomePage.title,
          icon: existingHomePage.icon ?? nextHomePage.icon,
          cover: existingHomePage.cover ?? nextHomePage.cover,
        };
        const pages = {
          ...state.pages,
          [firstWsId]: existingPages.map((page, index) => index === existingIndex ? migratedHomePage : page),
        };
        savePagesCache(pages);
        return { pages };
      }

      const pages = {
        ...state.pages,
        [firstWsId]: [nextHomePage, ...existingPages],
      };
      savePagesCache(pages);
      return { pages };
    });
  }, [activePage, firstWsId, homeDashboardPage, session?.userId, showTrash]);

  useEffect(() => {
    if (!activePage || activePage?.kind !== "page" || !jwt) return;
    const page = pageById(activePage.id);
    if (!page) {
      fetchPageContent(activePage.id, jwt);
    }
  }, [activePage, jwt, pageById, fetchPageContent]);

  useEffect(() => {
    if (activePage?.kind === "page" && !pageById(activePage.id)) {
      clearActivePage({ activePage: null, navigationPath: [] });
    }
  }, [activePage, pageById, clearActivePage]);

  /* ── Trash view ────────────────────────────────────────────────── */
  if (showTrash) {
    return (
      <ErrorBoundary>
        <div className="flex-1 min-w-0 h-full overflow-auto bg-[var(--osio-bg-page)]">
          <TrashView />
        </div>
      </ErrorBoundary>
    );
  }

  /* ── Editable Home dashboard (no page selected) ───────────────── */
  if (!activePage) {
    return (
      <ErrorBoundary>
        <div className="flex-1 min-w-0 h-full overflow-hidden bg-[var(--osio-bg-page)]">
          {homeDashboardPage ? <OsionosPage pageId={homeDashboardPage._id} /> : <LoadingPane />}
        </div>
      </ErrorBoundary>
    );
  }

  if (activePage.kind === "page" && !pageById(activePage.id)) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-4 h-full bg-[var(--osio-bg-page)]">
        <h1 className="text-2xl font-bold text-[var(--osio-fg-default)]">
          Page unavailable
        </h1>
        <p className="text-sm text-[var(--osio-fg-muted)] text-center max-w-sm">
          You do not have access to this page in the current session.
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90 transition-opacity"
          onClick={() =>
            clearActivePage({ activePage: null, navigationPath: [] })
          }
        >
          Back to home
        </button>
      </div>
    );
  }

  /* ── Database view ─────────────────────────────────────────────── */
  if (activePage.kind === "database") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingPane />}>
          <div className="flex-1 min-w-0 h-full overflow-auto bg-[var(--osio-bg-page)]">
            <DatabaseBlock databaseId={activePage.databaseId ?? activePage.id} mode="full" />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (activePage.kind === "channel") {
    return (
      <ErrorBoundary>
        <div className="flex-1 min-w-0 h-full overflow-hidden bg-[var(--osio-bg-page)]">
          <ChannelMessagesView
            channelId={activePage.id}
            workspaceId={activePage.workspaceId}
            title={activePage.title}
          />
        </div>
      </ErrorBoundary>
    );
  }

  /* ── Page view — osionos-style layout ───────────────────────────── */
  return (
    <div className="flex-1 min-w-0 h-full overflow-hidden">
      <OsionosPage pageId={activePage.id} />
    </div>
  );
};

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
  </div>
);
