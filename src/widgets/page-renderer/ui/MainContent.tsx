/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 18:19:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect } from "react";
import { Plus } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";

import { ErrorBoundary } from "@/shared/ui";
import { getCollectionEmojiValue } from "@/shared/lib/markengine/uiCollectionAssets";
import { DatabaseBlock } from "@/widgets/database-view";
import { OsionosPage } from "@/pages/notion-page";
import { TrashView } from "@/pages/trash-view";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";

/**
 * Renders the right-hand content panel.
 * Shows home splash, DatabaseBlock, or the osionos-style page view.
 */
export const MainContent: React.FC = () => {
  const activePage = usePageStore((s) => s.activePage);
  const showTrash = usePageStore((s) => s.showTrash);
  const pageById = usePageStore((s) => s.pageById);
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const addPage = usePageStore((s) => s.addPage);
  const openPage = usePageStore((s) => s.openPage);
  const clearActivePage = usePageStore.setState;
  const session = useUserStore((s) => s.activeSession());
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const persona = useUserStore((s) => s.activePersona());

  const jwt = session?.accessToken ?? "";
  const firstWsId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? "";

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
        <div className="flex-1 h-full overflow-auto bg-[var(--color-surface-primary)]">
          <TrashView />
        </div>
      </ErrorBoundary>
    );
  }

  /* ── Home splash (no page selected) ────────────────────────────── */
  if (!activePage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 h-full bg-[var(--color-surface-primary)]">
        <AssetRenderer
          value={persona?.emoji ?? getCollectionEmojiValue("party")}
          size={40}
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--color-ink)] mb-1">
            {persona?.name ?? "Welcome"}
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {activeWorkspace?.name ?? session?.privateWorkspaces[0]?.name ?? "Your workspace"} is ready.
          </p>
        </div>
        <button
          type="button"
          disabled={!firstWsId}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
            "bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          ].join(" ")}
          onClick={async () => {
            if (!firstWsId) return;
            const p = await addPage(firstWsId, "Untitled", jwt);
            if (p)
              openPage({
                id: p._id,
                workspaceId: firstWsId,
                kind: "page",
                title: p.title,
              });
          }}
        >
          <Plus size={16} />
          New page
        </button>
      </div>
    );
  }

  if (activePage.kind === "page" && !pageById(activePage.id)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full bg-[var(--color-surface-primary)]">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">
          Page unavailable
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)] text-center max-w-sm">
          You do not have access to this page in the current session.
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
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
          <div className="flex-1 h-full overflow-auto bg-[var(--color-surface-primary)]">
            <DatabaseBlock databaseId={activePage.id} mode="full" />
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  /* ── Page view — osionos-style layout ───────────────────────────── */
  return (
    <div className="flex-1 h-full overflow-hidden">
      <OsionosPage pageId={activePage.id} />
    </div>
  );
};

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
  </div>
);
