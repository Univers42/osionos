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

import React, { useEffect, useState } from "react";

import type { UserSession } from "@/entities/user";
import { useUserStore } from "@/features/auth";
import { isBridgeSession, PRISMATICA_URL } from "@/features/auth/model/userStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache, saveRecents } from "@/store/pageStore.helpers";
import { Sidebar } from "@/widgets/sidebar";
import { SidebarTrigger } from "@/features/ui-orchestrator/ui/SidebarTrigger";
import { MainContent } from "@/widgets/page-renderer";
import { applyTheme, readStoredThemeMode } from "@/shared/config/theme";
import { WorkspaceThemePanel } from "@/features/theme/WorkspaceThemePanel";
import {
  applyWorkspaceAppearance,
  clearWorkspaceAppearance,
  resolveWorkspaceConfig,
  useWorkspaceConfigStore,
  workspaceConfigKey,
} from "@/shared/config/workspaceConfigStore";
import { LazySettingsCenter } from "@/features/settings/LazySettingsCenter";
import { ToastViewport } from "@/shared/ui";
import { CanvasDebugRoute } from "@/features/block-editor/ui/canvas/__demo__/CanvasDebugRoute";

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
  const ready = initialized;

  // Run once on mount
  useEffect(() => {
    applyTheme(readStoredThemeMode());

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
    return <CanvasDebugRoute />;
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
      className="relative flex h-screen w-screen overflow-hidden bg-[var(--osio-bg-page)]"
    >
      {/* Left sidebar */}
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHome={() =>
          usePageStore.setState({
            activePage: null,
            showTrash: false,
            navigationPath: [],
          })
        }
        onOpenTrash={() =>
          usePageStore.setState({
            activePage: null,
            showTrash: true,
            navigationPath: [],
          })
        }
      />

      {/* Floating trigger for when sidebar is closed */}
      <SidebarTrigger />

      {/* Content area */}
      <main className="flex-1 flex min-w-0 overflow-hidden relative">
        <MainContent />
      </main>

      <WorkspaceThemePanel />
      {settingsOpen && <LazySettingsCenter initialTab="general" onClose={() => setSettingsOpen(false)} />}
      <ToastViewport />
    </div>
  );
};

export default App;
