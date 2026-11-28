/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   App.tsx                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";

import { useUserStore } from "@/features/auth";
import { isBridgeSession, isPortalMode } from "@/features/auth/model/userStore.helpers";
import { Portal } from "@/features/auth/ui/Portal";
import { usePageSync } from "@/store/sync/usePageSync";
import { useUnreadSync } from "@/store/chat/useUnreadSync";
import { useNotifyLive } from "@/store/chat/useNotifyLive";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { usePresenceHeartbeat } from "@/shared/people/usePresenceHeartbeat";
import { useZenMode } from "@/shared/config/useZenMode";
import { useUIStore } from "@/shared/config/uiStore";
import { useTemplateRecurrence } from "@/store/sync/templateRecurrence";
import { usePageStore } from "@/store/usePageStore";
import { loadActivePage } from "@/store/pageStore.helpers";
import { useLayoutPagePrune } from "@/widgets/workspace-grid/model/useLayoutPagePrune";
import { useNavHistoryRecorder } from "@/widgets/workspace-grid/model/useNavHistory";
import { useDocumentTitle } from "@/widgets/workspace-grid/model/tabTitle";
import { SidebarHosts } from "./SidebarHosts";
import { LazyCanvasDebugRoute, LazyMachineView, LazyStyleGuideRoute, LazyWorkbench } from "./lazyAppRegions";
import { syncObjectDbForAccount } from "./objectDbAccountSync";
import { PrivateWorkspaceScreen, SigningInScreen } from "./SessionGateScreens";
import { ShellHosts } from "./ShellHosts";
import { ensureBridgeWorkspacePages, seedEmptyOnlineWorkspaces } from "./workspaceBootstrap";
import { startDrawnCaret } from "@/features/theme/model/drawnCaret";
import { applyStoredAppearance, watchSystemTheme } from "@/shared/config/theme";
import { applyStoredTheme } from "@/shared/config/themeApply";
import { PHONE_QUERY, useResponsiveSidebar } from "@/shared/config/useResponsiveSidebar";
import { useMediaQuery } from "@/shared/config/useMediaQuery";
import { PhoneApp } from "./PhoneApp";
import { openSettings } from "@/features/settings/model/settingsNav";
import { readOAuthReturn } from "@/features/ai/model/aiOAuthReturn";
import { useAutomationDispatcher } from "@/features/automations/model/useAutomationDispatcher";
import { useConnectivityNotices } from "@/features/connectivity/model/useConnectivityNotices";
import { useVariablesSync } from "@/features/variables/model/useVariablesSync";
import { useDatabaseAutomationBridge } from "@/widgets/database-view/model/useDatabaseAutomationBridge";
import { TopBar } from "@/widgets/top-bar";
import { BindingSourcesProvider } from "@/features/bindings/ui/BindingSourcesProvider";

const LazyNoAccessScreen = React.lazy(() =>
  import("@/features/page-link/NoAccessScreen").then((module) => ({ default: module.NoAccessScreen })),
);

function isDevCanvasDebugRoute() {
  if (!import.meta.env.DEV || globalThis.window === undefined) return false;
  return globalThis.window.location.pathname === "/__canvas-debug" || globalThis.window.location.hash.includes("__canvas-debug");
}

function isDevStyleGuideRoute() {
  if (!import.meta.env.DEV || globalThis.window === undefined) return false;
  return globalThis.window.location.pathname === "/__styleguide";
}

/**
 * Root of the Playground app.
 *
 * On mount:
 * 1. `useUserStore.init()` logs in all 3 pre-seeded accounts in parallel.
 * 2. If online (API reachable): fetch pages from MongoDB for each workspace.
 *    If a workspace has zero pages, seed them from SEED_PAGES via the API.
 * 3. If offline: load in-memory seed data for instant local use.
 */
const App: React.FC = () => {
  const initUsers = useUserStore((s) => s.init);
  const initialized = useUserStore((s) => s.initialized);
  const error = useUserStore((s) => s.error);
  const activeUserId = useUserStore((s) => s.activeUserId);
  // The way back from OpenRouter: the app comes back with ?code&state, and the
  // panel that finishes the sign-in opens right away.
  useEffect(() => {
    if (readOAuthReturn(globalThis.location?.href ?? "")) openSettings("ai_connections");
  }, []);
  // Captured once at first render, before init effects can reset activePage,
  // so a refresh can reopen the page the user was last on.
  const [persistedActivePage] = useState(() => loadActivePage());
  const seeded = usePageStore((s) => s.seeded);
  const deniedPage = usePageStore((s) => s.deniedPage);
  const deniedPageId = deniedPage?.pageId ?? null;
  const ready = initialized;

  // Persist pages to the BaaS (source of truth) with hydrate-on-load + offline outbox;
  // zustand + localStorage are the cache. The graph reads these canonical pages via the
  // bridge (GET /api/graph/pages), so no separate note-mirror sync is needed.
  usePageSync();
  useNavHistoryRecorder();
  useLayoutPagePrune(); // close tab-bar tabs when their page is archived/deleted
  useDocumentTitle();
  useUnreadSync(); // seed per-channel unread badges (mount + 60s + focus)
  useNotifyLive(); // seed + live in-app notifications (toasts + store)
  useConnectivityNotices(); // offline / unstable / back online: a toast and the status-bar chip

  // Hydrate the per-user favorites set (bridge is source of truth) when the session changes.
  useEffect(() => {
    if (activeUserId) void useFavoritesStore.getState().hydrate();
  }, [activeUserId]);

  // App-wide presence: one heartbeat keeps last_seen_at fresh while osionos is open so
  // peers render online (refcounted singleton — profile/search views reuse the same one).
  usePresenceHeartbeat();

  // Materialize recurring templates ("Duplicate every…") on a catch-up timer.
  useTemplateRecurrence();

  // Collapse the pushing sidebar to the icon rail on mobile so content isn't squished.
  useResponsiveSidebar();
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Single document-level keyboard-shortcut dispatcher (flag osio.automations; inert when OFF).
  useAutomationDispatcher();
  useVariablesSync();

  // Zen (focus) mode — Ctrl+K Ctrl+Z. Drives [data-zen] on the shell; global.css
  // hides every chrome region off it. Session-only: a reload always exits zen.
  const zen = useZenMode((s) => s.zen);
  const topBarAutoHide = useUIStore((s) => s.topBarAutoHide);

  // Database automations → app services: notify events become toasts; webhook
  // actions route through the bridge's SSRF-guarded proxy endpoint.
  useDatabaseAutomationBridge();

  // Pull this account's object databases (records + sidebar registry) from the
  // server whenever a session is active — on load, after an interactive login,
  // and on account switch (reset first so the new account starts clean).
  const objectDbActiveUser = useUserStore((s) => s.activeUserId);
  const objectDbPrevUser = useRef<string | null>(null);
  useEffect(() => {
    // Dynamic import, deliberately: knownDatabaseState statically drags the 458KB
    // object-DB seed JSON (+ the notion-database-sys store) — as a static import in
    // App it was the single largest module in the warm chunk. Loading it here moves
    // all of it to an async chunk fetched right after mount; the module is cached,
    // so account switches re-enter instantly.
    return syncObjectDbForAccount(
      () => import("@/widgets/database-view/model/knownDatabaseState"),
      objectDbPrevUser,
      objectDbActiveUser,
    );
  }, [objectDbActiveUser]);

  useEffect(() => startDrawnCaret(), []);

  // Run once on mount
  useEffect(() => {
    applyStoredAppearance();
    applyStoredTheme();

    if (initialized) {
      return;
    }

    initUsers()
      .then(async () => {
        // Guard against StrictMode race: if initUsers() returned early
        // (because another invocation is still in progress), sessions
        // won't be populated yet. Only proceed if init actually completed.
        const state = useUserStore.getState();
        if (!state.initialized) return;

        const { sessions, activeUserId } = state;
        const session = sessions[activeUserId];
        const jwt = state.activePageJwt() ?? "";

        if (!jwt) {
          if (isBridgeSession(session)) {
            ensureBridgeWorkspacePages(session);
            return;
          }

          usePageStore.getState().seedOfflinePages();
          return;
        }

        await seedEmptyOnlineWorkspaces(sessions, jwt);
      })
      .catch(() => undefined);
  }, [initUsers, initialized]);

  // After pages are loaded, reopen the page from the previous session (refresh
  // should stay on the same page instead of dropping back to Home).
  useEffect(() => {
    if (!seeded || !persistedActivePage) return;
    const store = usePageStore.getState();
    if (store.activePage || store.showTrash) return;
    if (store.pageById(persistedActivePage.id)) {
      store.openPage(persistedActivePage);
    }
  }, [seeded, persistedActivePage]);

  useEffect(() => watchSystemTheme(), []);

  if (isDevCanvasDebugRoute()) {
    return <LazyCanvasDebugRoute />;
  }

  if (isDevStyleGuideRoute()) {
    return <LazyStyleGuideRoute />;
  }

  if (!ready) return <SigningInScreen />;

  if (isPortalMode() && !activeUserId) {
    return <Portal />;
  }

  if (error === "bridge-session-required" || !activeUserId) return <PrivateWorkspaceScreen />;

  // A connected machine's folder (ADR-006): signed in, and nothing of the workbench around it.
  if (globalThis.location?.pathname === "/machine") return <LazyMachineView />;

  if (isPhone) return <PhoneApp />;

  const onOpenSettings = () => openSettings();

  return (
    <BindingSourcesProvider>
      <div
        data-testid="app-shell"
        data-osio-shell
        data-zen={zen ? "1" : undefined}
        data-topbar-autohide={topBarAutoHide ? "1" : undefined}
        className="relative flex flex-col h-screen w-screen overflow-hidden bg-[var(--osio-bg-canvas)]"
      >
        {/* First stop of the Tab order, shown only when focused: past the top bar and the sidebar (RGAA 12.7). */}
        <a
          href="#osio-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--osio-bg-page)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--osio-fg-default)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          Skip to content
        </a>

        {/* Global VSCode-style top bar: logo · menus · command/search · update · window controls */}
        <TopBar onOpenSettings={openSettings} />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <SidebarHosts edge="left" onOpenSettings={onOpenSettings} />

          {/* Content area — the unified workbench (grid + dock + status bar), or the
              no-access screen when a shared link pointed at an unreadable page. */}
          <main id="osio-main" tabIndex={-1} className="flex-1 flex min-w-0 overflow-hidden relative outline-none">
            {deniedPageId ? (
              <React.Suspense fallback={null}>
                <LazyNoAccessScreen />
              </React.Suspense>
            ) : (
              <LazyWorkbench />
            )}
          </main>

          <SidebarHosts edge="right" onOpenSettings={onOpenSettings} />
        </div>

        <ShellHosts />
      </div>
    </BindingSourcesProvider>
  );
};

export default App;
