/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeTabView.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense } from "react";

import { useHomeVariantStore, type HomeVariant } from "@/widgets/home-variants/model/homeVariantStore";

import { getHomeDashboardPageId } from "@/widgets/database-view/model/databaseViewCatalog.meta";
import { WS_FILES_DB_ID, WS_FILES_TABLE_VIEW } from "@/widgets/database-view/model/workspaceDatabaseConstants";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import {
  LazyGraphEngineExplorer,
  LazyHomeWorkspaceMode,
  LazyOsionosPage,
  LazyWorkspaceDatabaseBlock,
} from "./lazyViews";

import "./homeVariants.css";

const LoadingPane: React.FC = () => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="animate-spin w-6 h-6 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
  </div>
);

/** The Home "tab": the Dashboard / Second Brain / Database / Gallery surfaces. */
export const HomeTabView: React.FC = () => {
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const firstPrivateWorkspaceId = useUserStore((s) => s.activeSession()?.privateWorkspaces[0]?._id ?? "");
  const firstWsId = activeWorkspaceId || firstPrivateWorkspaceId;
  const homeDashboardPageId = firstWsId ? getHomeDashboardPageId(firstWsId) : "";
  const homeDashboardPage = usePageStore((s) => (
    firstWsId ? s.pages[firstWsId]?.find((page) => page._id === homeDashboardPageId && !page.archivedAt) : undefined
  ));

  // The Home surface picker now unfolds from the Home tab itself (TabButton);
  // here we just render the chosen surface.
  const variant = useHomeVariantStore((s) => s.variant);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--osio-bg-page)]">
      <div className="osionos-home-shell flex-1 min-h-0">
        {/* flex-1 box so canvas variants (graph) get a real height instead of a
            fragile height:100% chain that collapses to the inspector's height. */}
        <div className="relative flex-1 min-h-0 w-full">
          <Suspense fallback={<LoadingPane />}>
            {renderHomeVariantContent(variant, homeDashboardPage)}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

function renderHomeVariantContent(variant: HomeVariant, homeDashboardPage: PageEntry | undefined): React.ReactNode {
  if (variant === "graph") return <LazyGraphEngineExplorer />;
  if (variant === "database") {
    // The Database surface is the notion-database-sys (ObjectDatabase) over the live
    // workspace pages — Files as a real Notion table with the full view chrome.
    // ?view=<id> deep-links a specific view ("Copy link to view").
    const linkedView = globalThis.window === undefined
      ? null
      : new URLSearchParams(globalThis.location.search).get("view");
    return (
      <div className="h-full min-h-0 overflow-hidden p-3">
        <LazyWorkspaceDatabaseBlock databaseId={WS_FILES_DB_ID} initialViewId={linkedView ?? WS_FILES_TABLE_VIEW} mode="full" chrome="full" />
      </div>
    );
  }
  if (variant === "workspace") return <LazyHomeWorkspaceMode />;
  if (homeDashboardPage) return <LazyOsionosPage pageId={homeDashboardPage._id} />;
  return <LoadingPane />;
}
