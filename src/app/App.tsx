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

import type { UserSession } from "@/entities/user";
import { useUserStore } from "@/features/auth";
import { isBridgeSession, isPortalMode, PRISMATICA_URL } from "@/features/auth/model/userStore.helpers";
import { Portal } from "@/features/auth/ui/Portal";
import { usePageSync } from "@/store/sync/usePageSync";
import { useUnreadSync } from "@/store/chat/useUnreadSync";
import { useNotifyLive } from "@/store/chat/useNotifyLive";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { QuickCaptureModal } from "@/features/quick-capture/ui/QuickCaptureModal";
import { WorkspaceIntentModal } from "@/features/workspace-onboarding/ui/WorkspaceIntentModal";
import { usePresenceHeartbeat } from "@/shared/people/usePresenceHeartbeat";
import { useZenMode } from "@/shared/config/useZenMode";
import { useTemplateRecurrence } from "@/store/sync/templateRecurrence";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState, loadActivePage, savePagesCache, saveRecents } from "@/store/pageStore.helpers";
import { ActivitySidebar } from "@/widgets/activity-rail";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { useLayoutPagePrune } from "@/widgets/workspace-grid/model/useLayoutPagePrune";
import { trashTab, consoleTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { SidebarTrigger } from "@/features/ui-orchestrator/ui/SidebarTrigger";
import { LazyCanvasDebugRoute, LazyIdeShell, LazyMainContent, LazyStyleGuideRoute } from "./lazyAppRegions";
import { isIdeEnabled } from "@/shared/config/featureFlags";
import { useIdeModeStore } from "@/features/ide/model/ideModeStore";
import { applyStoredAppearance } from "@/shared/config/theme";
import { useResponsiveSidebar } from "@/shared/config/useResponsiveSidebar";
import { WorkspaceThemePanel } from "@/features/theme/WorkspaceThemePanel";
import {
  applyWorkspaceAppearance,
  clearWorkspaceAppearance,
  resolveWorkspaceConfig,
  useWorkspaceConfigStore,
  workspaceConfigKey,
} from "@/shared/config/workspaceConfigStore";
import { LazySettingsCenter } from "@/features/settings/LazySettingsCenter";
import { useAutomationDispatcher } from "@/features/automations/model/useAutomationDispatcher";
import { useDatabaseAutomationBridge } from "@/widgets/database-view/model/useDatabaseAutomationBridge";
import type { SettingsTab } from "@/shared/ui/primitives/useSettingsSearchIndex";
import { ToastViewport } from "@/shared/ui/primitives";
import { ShareHost } from "@/features/share/ShareHost";
import { TopBar } from "@/widgets/top-bar";
import { ContactDock } from "@/widgets/contact-dock/ui/ContactDock";

type UserSessions = Record<string, UserSession>;

function ensureBridgeWorkspacePages(session: UserSession | null | undefined) {
  const workspaceIds = [
    ...(session?.privateWorkspaces ?? []),
    ...(session?.sharedWorkspaces ?? []),
  ].map((workspace) => workspace._id);
  const allowedWorkspaceIds = new Set(workspaceIds);

  usePageStore.setState((pageState) => {
    const pages = Object.fromEntries(
      workspaceIds.map((workspaceId) => [workspaceId, pageState.pages[workspaceId] ?? []]),
    );
    const recents = pageState.recents.filter((recent) => allowedWorkspaceIds.has(recent.workspaceId));
    const activePage = pageState.activePage && allowedWorkspaceIds.has(pageState.activePage.workspaceId)
      ? pageState.activePage
      : null;
    const navigationPath = pageState.navigationPath.filter((page) => allowedWorkspaceIds.has(page.workspaceId));

    for (const workspaceId of workspaceIds) {
      pages[workspaceId] = pages[workspaceId] ?? [];
    }
    savePagesCache(pages);
    saveRecents(recents);
    return {
      ...derivePageState(pages, pageState.pageIdsByWorkspace),
      recents,
      activePage,
      navigationPath,
      seeded: true,
      showTrash: false,
    };
  });
}

function uniqueSessionWorkspaces(sessions: UserSessions) {
  const seen = new Set<string>();
  return Object.values(sessions)
    .flatMap((session) => [...session.privateWorkspaces, ...session.sharedWorkspaces])
    .filter((workspace) => {
      if (seen.has(workspace._id)) return false;
      seen.add(workspace._id);
      return true;
    });
}

async function seedEmptyOnlineWorkspaces(sessions: UserSessions, jwt: string) {
  const uniqueWorkspaces = uniqueSessionWorkspaces(sessions);
  await Promise.all(
    uniqueWorkspaces.map((workspace) => usePageStore.getState().fetchPages(workspace._id, jwt)),
  );

  const pages = usePageStore.getState().pages;
  const anyEmpty = uniqueWorkspaces.some(
    (workspace) => (pages[workspace._id] ?? []).length === 0,
  );
  if (!anyEmpty) return;

  const personas = useUserStore.getState().personas;
  const workspaceMap: Record<string, string> = {};

  for (let index = 0; index < personas.length; index++) {
    const persona = personas[index];
    const personaSession = sessions[persona.id];
    if (!personaSession) continue;
    const privateWorkspace = personaSession.privateWorkspaces[0];
    if (privateWorkspace) workspaceMap[`mock-ws-private-${index}`] = privateWorkspace._id;
    const sharedWorkspace = personaSession.sharedWorkspaces[0];
    if (sharedWorkspace) workspaceMap["mock-ws-shared-team"] = sharedWorkspace._id;
  }

  await usePageStore.getState().seedOnlinePages(workspaceMap, jwt);
}

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
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const workspaceKey = workspaceConfigKey(activeUserId || "anonymous", activeWorkspace?._id ?? "workspace");
  const storedWorkspaceConfig = useWorkspaceConfigStore((s) => s.configs[workspaceKey]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const openSettings = (tab?: SettingsTab) => {
    setSettingsTab(tab ?? "general");
    setSettingsOpen(true);
  };
  // Captured once at first render, before init effects can reset activePage,
  // so a refresh can reopen the page the user was last on.
  const [persistedActivePage] = useState(() => loadActivePage());
  const seeded = usePageStore((s) => s.seeded);
  const ready = initialized;

  // Persist pages to the BaaS (source of truth) with hydrate-on-load + offline outbox;
  // zustand + localStorage are the cache. The graph reads these canonical pages via the
  // bridge (GET /api/graph/pages), so no separate note-mirror sync is needed.
  usePageSync();
  useLayoutPagePrune(); // close tab-bar tabs when their page is archived/deleted
  useUnreadSync(); // seed per-channel unread badges (mount + 60s + focus)
  useNotifyLive(); // seed + live in-app notifications (toasts + store)

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

  // Single document-level keyboard-shortcut dispatcher (flag osio.automations; inert when OFF).
  useAutomationDispatcher();

  // Zen (focus) mode — Ctrl+K Ctrl+Z. Drives [data-zen] on the shell; global.css
  // hides every chrome region off it. Session-only: a reload always exits zen.
  const zen = useZenMode((s) => s.zen);

  // Dedicated IDE layout: flip the content region into the VS Code-style shell
  // when this workspace is in IDE mode (double-gated on the osio.ide flag, so a
  // stock build never renders it and the normal grid is untouched).
  const activeWorkspaceId = activeWorkspace?._id ?? "";
  const ideModeOn = useIdeModeStore((s) => (activeWorkspaceId ? s.byWorkspace[activeWorkspaceId] === true : false));
  const showIde = ideModeOn && isIdeEnabled();

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
    void import("@/widgets/database-view/model/knownDatabaseState").then(
      ({ resetObjectDatabaseSync, startObjectDatabaseSync }) => {
        if (objectDbPrevUser.current && objectDbPrevUser.current !== objectDbActiveUser) {
          resetObjectDatabaseSync();
        }
        objectDbPrevUser.current = objectDbActiveUser ?? null;
        startObjectDatabaseSync();
      },
    );
  }, [objectDbActiveUser]);

  // Run once on mount
  useEffect(() => {
    applyStoredAppearance();

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

  useEffect(() => {
    if (!activeWorkspace?._id) return;
    const appearance = resolveWorkspaceConfig(storedWorkspaceConfig).appearance;
    if (appearance) {
      applyWorkspaceAppearance(appearance);
      return;
    }
    clearWorkspaceAppearance();
  }, [activeWorkspace?._id, storedWorkspaceConfig]);

  if (isDevCanvasDebugRoute()) {
    return <LazyCanvasDebugRoute />;
  }

  if (isDevStyleGuideRoute()) {
    return <LazyStyleGuideRoute />;
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--osio-bg-page)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--osio-accent)] border-t-transparent rounded-full" />
          <p className="text-sm text-[var(--osio-fg-muted)]">Signing in...</p>
        </div>
      </div>
    );
  }

  if (isPortalMode() && !activeUserId) {
    return <Portal />;
  }

  if (error === "bridge-session-required" || !activeUserId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--osio-bg-page)] px-6 text-[var(--osio-fg-default)]">
        <section className="w-full max-w-md rounded-md border border-[var(--osio-border)] bg-[var(--osio-bg-panel)] p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">Private workspace</p>
          <h1 className="mt-3 text-2xl font-semibold">Open osionos from Prismatica</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--osio-fg-muted)]">
            This app only opens after your Prismatica account creates a signed workspace handoff.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
            onClick={() => { globalThis.location.href = PRISMATICA_URL; }}
          >
            Go to Prismatica
          </button>
        </section>
      </div>
    );
  }

  return (
    <div
      data-testid="app-shell"
      data-zen={zen ? "1" : undefined}
      className="relative flex flex-col h-screen w-screen overflow-hidden bg-[var(--osio-bg-page)]"
    >
      {/* Global VSCode-style top bar: logo · menus · command/search · update · window controls */}
      <TopBar onOpenSettings={openSettings} />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar */}
        <ActivitySidebar
          onOpenSettings={() => openSettings()}
          onOpenTrash={() => useWorkspaceLayout.getState().openTab(trashTab())}
          onOpenConsole={() => useWorkspaceLayout.getState().openTab(consoleTab())}
        />

        {/* Floating trigger for when sidebar is closed */}
        <SidebarTrigger />

        {/* Content area — the dedicated IDE shell when this workspace is in IDE
            mode, otherwise the normal tabbed/splittable workspace grid. */}
        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          {showIde ? <LazyIdeShell /> : <LazyMainContent />}
        </main>
      </div>

      <WorkspaceThemePanel />
      {settingsOpen && <LazySettingsCenter initialTab={settingsTab} onClose={() => setSettingsOpen(false)} />}
      <ToastViewport />
      <ShareHost />
      <ContactDock />
      <QuickCaptureModal />
      <WorkspaceIntentModal />
    </div>
  );
};

export default App;
