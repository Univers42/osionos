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

import React, { Suspense, useEffect, useState } from "react";
import { ChevronDown, LayoutDashboard, Network, Database, Images } from "lucide-react";

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

const HOME_VARIANT_STORAGE_KEY = "osionos.home.variant";
type HomeVariant = "dashboard" | "graph" | "database" | "workspace";

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

  const [variant, setVariant] = useState<HomeVariant>(() => {
    if (globalThis.window === undefined) return "dashboard";
    // Deep-link override (?home=graph|database|workspace|dashboard) wins over the
    // persisted choice, so a Home surface can be opened/linked directly.
    const linked = new URLSearchParams(globalThis.location.search).get("home");
    if (linked === "graph" || linked === "database" || linked === "workspace" || linked === "dashboard") return linked;
    const stored = globalThis.localStorage.getItem(HOME_VARIANT_STORAGE_KEY);
    return stored === "graph" || stored === "database" ? stored : "dashboard";
  });
  useEffect(() => { globalThis.localStorage.setItem(HOME_VARIANT_STORAGE_KEY, variant); }, [variant]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--osio-bg-page)]">
      <div className="osionos-home-shell flex-1 min-h-0">
        <HomeVariantMenu variant={variant} onVariantChange={setVariant} />
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
    return (
      <div className="h-full min-h-0 overflow-hidden p-3">
        <LazyWorkspaceDatabaseBlock databaseId={WS_FILES_DB_ID} initialViewId={WS_FILES_TABLE_VIEW} mode="full" chrome="full" />
      </div>
    );
  }
  if (variant === "workspace") return <LazyHomeWorkspaceMode />;
  if (homeDashboardPage) return <LazyOsionosPage pageId={homeDashboardPage._id} />;
  return <LoadingPane />;
}

const HOME_MENU_ITEMS: Array<{ id: HomeVariant; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} aria-hidden="true" /> },
  { id: "graph", label: "Second Brain", icon: <Network size={16} aria-hidden="true" /> },
  { id: "database", label: "Database", icon: <Database size={16} aria-hidden="true" /> },
  { id: "workspace", label: "Gallery", icon: <Images size={16} aria-hidden="true" /> },
];

const HomeVariantMenu: React.FC<{ variant: HomeVariant; onVariantChange: (v: HomeVariant) => void }> = ({ variant, onVariantChange }) => {
  const [open, setOpen] = useState(false);
  const activeLabel = HOME_MENU_ITEMS.find((item) => item.id === variant)?.label ?? "Dashboard";
  return (
    <div className="osionos-home-variant-menu" data-open={open ? "true" : undefined}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>Home</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div className="osionos-home-variant-dropdown" role="menu">
        {HOME_MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            data-active={variant === item.id ? "true" : undefined}
            onClick={() => { onVariantChange(item.id); setOpen(false); }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <span className="osionos-home-variant-current">{activeLabel}</span>
    </div>
  );
};
