/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MainContent.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from "react";

import {
  getKnownDatabaseView,
  getHomeDashboardPageId,
  HOME_DASHBOARD_PAGE_ICON,
  HOME_DASHBOARD_PAGE_TITLE,
  KNOWN_DATABASE_VIEWS,
} from "@/widgets/database-view/model/databaseViewCatalog.meta";
import { mergeHomeContent } from "@/widgets/page-renderer/model/homeContentMerge";
import { WorkspaceGrid } from "@/widgets/workspace-grid";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";

const HOME_DASHBOARD_VERSION = 10;
const HOME_DASHBOARD_FOCUS_VIEW_ID = "v-prod-table";

/** The profession the Home page was seeded from. The field lands with the
 *  profession-aware seed (a later package): until then it is absent and both
 *  sides of the comparison read null, so the trigger stays on the version. */
type HomePageWithProfession = PageEntry & { homeProfession?: string | null };

function getHomeProfession(page: PageEntry | undefined): string | null {
  return (page as HomePageWithProfession | undefined)?.homeProfession ?? null;
}

function homeDashboardNeedsRefresh(page: PageEntry | undefined, currentProfession: string | null): boolean {
  // A stale seed is caught by the version alone: every change to the seed's
  // structure bumps HOME_DASHBOARD_VERSION. The user's own edits (a deleted
  // section, a paragraph they added) are NOT a reason to re-seed — reading
  // them as one is what used to eat them.
  if (!page) return true;
  if (page.homeDashboardVersion !== HOME_DASHBOARD_VERSION) return true;
  return getHomeProfession(page) !== currentProfession;
}

type HomeLayoutContentBuilder =
  typeof import("@/widgets/database-view/model/databaseViewCatalog")["createHomeLayoutContent"];

function createHomeDashboardPage(createContent: HomeLayoutContentBuilder, workspaceId: string, ownerId: string | null, greetingName?: string): PageEntry {
  const focusView = getKnownDatabaseView(HOME_DASHBOARD_FOCUS_VIEW_ID);
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
      { key: "data_sources", label: "Data sources", type: "relation", value: ["projects", "tasks", "crm", "content", "inventory", "products"], relationTarget: "database" },
      {
        key: "views", label: "Views", type: "relation",
        value: [focusView, ...KNOWN_DATABASE_VIEWS].filter((view): view is NonNullable<typeof view> => Boolean(view)).slice(0, 8).map((view) => view.name),
        relationTarget: "database",
      },
      { key: "focus_view", label: "Featured /view", type: "text", value: focusView?.id ?? "v-prod-table" },
    ],
    content: createContent(greetingName, { idScope: getHomeDashboardPageId(workspaceId) }),
    surface: "home",
    homeDashboardVersion: HOME_DASHBOARD_VERSION,
  };
}

/**
 * The editor content region: a VSCode-style grid of tabbed, splittable panes
 * (see WorkspaceGrid). This component only keeps the Home-dashboard seeding side
 * effect alive so the Home tab always has a fresh dashboard page to render.
 */
export const MainContent: React.FC = () => {
  const activeUserId = useUserStore((s) => s.activeUserId);
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const firstPrivateWorkspaceId = useUserStore((s) => s.activeSession()?.privateWorkspaces[0]?._id ?? "");
  const firstWsId = activeWorkspaceId || firstPrivateWorkspaceId;
  const homeDashboardPageId = firstWsId ? getHomeDashboardPageId(firstWsId) : "";
  const homeDashboardPage = usePageStore((s) => (
    firstWsId ? s.pages[firstWsId]?.find((page) => page._id === homeDashboardPageId && !page.archivedAt) : undefined
  ));

  useEffect(() => {
    if (!firstWsId) return;
    // The profession-aware seed lands in a later package: no user has a
    // profession yet, so both sides of the profession check read null.
    if (!homeDashboardNeedsRefresh(homeDashboardPage, null)) return;

    // The home builder drags in the seeded database state (~600KB JSON), so it
    // is loaded on demand: only when the dashboard needs (re)seeding — the
    // common path (dashboard already current) never downloads it.
    let cancelled = false;
    void import("@/widgets/database-view/model/databaseViewCatalog").then(({ createHomeLayoutContent }) => {
      if (cancelled) return;
      const greetingName = useUserStore.getState().activePersona()?.name;
      const nextHomePage = createHomeDashboardPage(createHomeLayoutContent, firstWsId, activeUserId || null, greetingName);
      const seedContent = nextHomePage.content ?? [];
      usePageStore.setState((state) => {
        const existingPages = state.pages[firstWsId] ?? [];
        const existingIndex = existingPages.findIndex((page) => page._id === nextHomePage._id && !page.archivedAt);
        const existingHomePage = existingIndex >= 0 ? existingPages[existingIndex] : undefined;
        // A re-seed is a merge, never a replace: what the user wrote on the
        // Home page survives the seed (P2-4-b).
        const merged = mergeHomeContent(
          existingHomePage?.content ?? [],
          seedContent,
          existingHomePage?.homeSeedFingerprints,
        );
        const homePage: PageEntry = {
          ...nextHomePage,
          content: merged.content,
          homeSeedFingerprints: merged.fingerprints,
          title: existingHomePage?.title || nextHomePage.title,
          icon: existingHomePage?.icon ?? nextHomePage.icon,
          cover: existingHomePage?.cover ?? nextHomePage.cover,
        };
        const pages = existingIndex >= 0
          ? { ...state.pages, [firstWsId]: existingPages.map((page, index) => (index === existingIndex ? homePage : page)) }
          : { ...state.pages, [firstWsId]: [homePage, ...existingPages] };
        savePagesCache(pages);
        return derivePageState(pages, state.pageIdsByWorkspace);
      });
    });
    return () => { cancelled = true; };
  }, [activeUserId, firstWsId, homeDashboardPage]);

  return <WorkspaceGrid />;
};
