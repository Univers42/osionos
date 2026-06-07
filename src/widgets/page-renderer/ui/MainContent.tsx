/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, Network, Database, Images } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { ErrorBoundary } from "@/shared/ui";
import { isPerfEnabled } from "@/shared/lib/perf/measure";
import { DatabaseBlock } from "@/widgets/database-view";
import {
  createViewShowcaseLayoutContent,
  getKnownDatabaseView,
  getHomeDashboardPageId,
  HOME_DASHBOARD_PAGE_ICON,
  HOME_DASHBOARD_PAGE_TITLE,
  KNOWN_DATABASE_VIEWS,
} from "@/widgets/database-view/model/databaseViewCatalog";
import { ChannelMessagesView } from "@/widgets/channel-messages";
import { AgentConversationPage } from "@/widgets/agent-conversation";
import { OsionosPage } from "@/pages/notion-page";
import { TrashView } from "@/pages/trash-view";
import { HomeDatabaseMode, HomeWorkspaceMode } from "@/widgets/home-variants";
import { GraphEngineExplorer } from "@/widgets/graph-explorer";

import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import "./homeVariants.css";

const HOME_DASHBOARD_VERSION = 8;
const HOME_VARIANT_STORAGE_KEY = "osionos.home.variant";

const HOME_DASHBOARD_FOCUS_VIEW_ID = "v-prod-table";
type HomeVariant = "dashboard" | "graph" | "database" | "workspace";

function getHomeDashboardFocusViewId(page: PageEntry | undefined): string | undefined {
  const value = page?.properties?.find((property) => property.key === "focus_view")?.value;
  return typeof value === "string" ? value : undefined;
}

function hasHomeDashboardCanvas(page: PageEntry | undefined): boolean {
  const layoutBlock = page?.content?.find((block) => block.type === "layout");
  return Boolean(layoutBlock?.layoutCells && layoutBlock.layoutCells.length >= 12);
}

function homeDashboardNeedsRefresh(page: PageEntry | undefined, focusViewId: string | undefined): boolean {
  if (page?.homeDashboardVersion !== HOME_DASHBOARD_VERSION || !hasHomeDashboardCanvas(page)) return true;
  return Boolean(focusViewId && getHomeDashboardFocusViewId(page) !== focusViewId);
}
function createHomeDashboardPage(workspaceId: string, ownerId: string | null, focusViewId = HOME_DASHBOARD_FOCUS_VIEW_ID): PageEntry {
  const focusView = getKnownDatabaseView(focusViewId) ?? getKnownDatabaseView(HOME_DASHBOARD_FOCUS_VIEW_ID);
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
    properties: [
      { key: "status", label: "Status", type: "select", value: "Active", options: ["Active", "Planning", "Review"] },
      { key: "variant", label: "Home variant", type: "select", value: "Dashboard", options: ["Dashboard", "Second Brain"] },
      { key: "last_refresh", label: "Last refresh", type: "date", value: new Date().toISOString().slice(0, 10) },
      {
        key: "data_sources",
        label: "Data sources",
        type: "relation",
        value: ["projects", "tasks", "crm", "content", "inventory", "products"],
        relationTarget: "database",
      },
      {
        key: "views",
        label: "Views",
        type: "relation",
        value: [focusView, ...KNOWN_DATABASE_VIEWS].filter((view): view is NonNullable<typeof view> => Boolean(view)).slice(0, 8).map((view) => view.name),
        relationTarget: "database",
      },
      { key: "focus_view", label: "Featured /view", type: "text", value: focusView?.id ?? "v-prod-table" },
    ],
    content: createViewShowcaseLayoutContent("full_page", focusView?.id, { idScope: getHomeDashboardPageId(workspaceId) }),
    surface: "home",
    homeDashboardVersion: HOME_DASHBOARD_VERSION,
  };
}

/**
 * Renders the right-hand content panel.
 * Shows the editable home dashboard, DatabaseBlock, or the osionos-style page view.
 */
export const MainContent: React.FC = () => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] MainContent renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  const activePage = usePageStore(useShallow((s) => s.activePage ? {
    id: s.activePage.id,
    workspaceId: s.activePage.workspaceId,
    kind: s.activePage.kind,
    title: s.activePage.title,
    databaseId: s.activePage.databaseId,
  } : null));
  const showTrash = usePageStore((s) => s.showTrash);
  const pageById = usePageStore((s) => s.pageById);
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const clearActivePage = usePageStore.setState;
  const activeUserId = useUserStore((s) => s.activeUserId);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const firstPrivateWorkspaceId = useUserStore((s) => s.activeSession()?.privateWorkspaces[0]?._id ?? "");
  const [homeVariant, setHomeVariant] = useState<HomeVariant>(() => {
    if (globalThis.window === undefined) return "dashboard";
    const stored = globalThis.localStorage.getItem(HOME_VARIANT_STORAGE_KEY);
    return stored === "graph" || stored === "database" ? stored : "dashboard";
  });

  const firstWsId = activeWorkspaceId || firstPrivateWorkspaceId;
  const requestedHomeViewId = HOME_DASHBOARD_FOCUS_VIEW_ID;
  const homeDashboardPageId = firstWsId ? getHomeDashboardPageId(firstWsId) : "";
  const homeDashboardPage = usePageStore((s) => (
    firstWsId
      ? s.pages[firstWsId]?.find((page) => page._id === homeDashboardPageId && !page.archivedAt)
      : undefined
  ));

  useEffect(() => {
    if (activePage || showTrash || !firstWsId) return;
    if (!homeDashboardNeedsRefresh(homeDashboardPage, requestedHomeViewId)) return;

    const nextHomePage = createHomeDashboardPage(firstWsId, activeUserId || null, requestedHomeViewId);
    usePageStore.setState((state) => {
      const existingPages = state.pages[firstWsId] ?? [];
      const existingIndex = existingPages.findIndex((page) => page._id === nextHomePage._id && !page.archivedAt);

      if (existingIndex >= 0) {
        const existingHomePage = existingPages[existingIndex];
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
        return derivePageState(pages, state.pageIdsByWorkspace);
      }

      const pages = {
        ...state.pages,
        [firstWsId]: [nextHomePage, ...existingPages],
      };
      savePagesCache(pages);
      return derivePageState(pages, state.pageIdsByWorkspace);
    });
  }, [activePage, activeUserId, firstWsId, homeDashboardPage, requestedHomeViewId, showTrash]);

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

  useEffect(() => {
    globalThis.localStorage.setItem(HOME_VARIANT_STORAGE_KEY, homeVariant);
  }, [homeVariant]);

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
          <HomeVariantShell variant={homeVariant} onVariantChange={setHomeVariant}>
            {renderHomeVariantContent(homeVariant, homeDashboardPage)}
          </HomeVariantShell>
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

  if (activePage.kind === "page" && pageById(activePage.id)?.surface === "agent") {
    return (
      <ErrorBoundary>
        <div className="flex-1 min-w-0 h-full overflow-hidden bg-[var(--osio-bg-page)]">
          <AgentConversationPage pageId={activePage.id} />
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

function renderHomeVariantContent(variant: HomeVariant, homeDashboardPage: PageEntry | undefined): React.ReactNode {
  if (variant === "graph") return <GraphEngineExplorer />;
  if (variant === "database") return <HomeDatabaseMode />;
  if (variant === "workspace") return <HomeWorkspaceMode />;
  if (homeDashboardPage) return <OsionosPage pageId={homeDashboardPage._id} />;
  return <LoadingPane />;
}

const HomeVariantShell: React.FC<{
  variant: HomeVariant;
  onVariantChange: (variant: HomeVariant) => void;
  children: React.ReactNode;
}> = ({ variant, onVariantChange, children }) => {
  const [open, setOpen] = useState(false);
  const activeLabel = variant === "graph" ? "Second Brain"
    : variant === "database" ? "Database"
    : variant === "workspace" ? "Gallery"
    : "Dashboard";

  return (
    <div className="osionos-home-shell">
      <div className="osionos-home-variant-menu" data-open={open ? "true" : undefined}>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          <span>Home</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div className="osionos-home-variant-dropdown" role="menu">
          <button
            type="button"
            data-active={variant === "dashboard" ? "true" : undefined}
            onClick={() => {
              onVariantChange("dashboard");
              setOpen(false);
            }}
          >
            <LayoutDashboard size={16} aria-hidden="true" />
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            data-active={variant === "graph" ? "true" : undefined}
            onClick={() => {
              onVariantChange("graph");
              setOpen(false);
            }}
          >
            <Network size={16} aria-hidden="true" />
            <span>Second Brain</span>
          </button>
          <button
            type="button"
            data-active={variant === "database" ? "true" : undefined}
            onClick={() => {
              onVariantChange("database");
              setOpen(false);
            }}
          >
            <Database size={16} aria-hidden="true" />
            <span>Database</span>
          </button>
          <button
            type="button"
            data-active={variant === "workspace" ? "true" : undefined}
            onClick={() => {
              onVariantChange("workspace");
              setOpen(false);
            }}
          >
            <Images size={16} aria-hidden="true" />
            <span>Gallery</span>
          </button>
        </div>
        <span className="osionos-home-variant-current">{activeLabel}</span>
      </div>
      {children}
    </div>
  );
};
