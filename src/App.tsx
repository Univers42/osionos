/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   App.tsx                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 15:06:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";

import { useUserStore } from "./store/useUserStore";
import { usePageStore } from "./store/usePageStore";
import { NotionSidebar } from "./components/sidebar/NotionSidebar";
import { MainContent } from "./components/MainContent";

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
  const [ready, setReady] = useState(false);

  const initUsers = useUserStore((s) => s.init);
  const initialized = useUserStore((s) => s.initialized);

  // Run once on mount
  useEffect(() => {
    if (initialized) {
      setReady(true);
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
        const jwt = session?.accessToken ?? "";

        if (!jwt) {
          // Offline mode — load in-memory seed data
          usePageStore.getState().seedOfflinePages();
          return;
        }

        // Online mode — fetch pages from MongoDB for every workspace
        const allWorkspaces = Object.values(sessions).flatMap((s) => [
          ...s.privateWorkspaces,
          ...s.sharedWorkspaces,
        ]);
        // Deduplicate by _id
        const seen = new Set<string>();
        const uniqueWs = allWorkspaces.filter((w) => {
          if (seen.has(w._id)) return false;
          seen.add(w._id);
          return true;
        });

        // Fetch pages for each workspace
        await Promise.all(
          uniqueWs.map((w) => usePageStore.getState().fetchPages(w._id, jwt)),
        );

        // Check if any workspace is empty -> seed if needed
        const pages = usePageStore.getState().pages;
        const anyEmpty = uniqueWs.some(
          (w) => (pages[w._id] ?? []).length === 0,
        );

        if (anyEmpty) {
          // Build workspace mapping: mock seed IDs -> real workspace IDs
          // Seed pages reference mock-ws-private-0/1/2 and mock-ws-shared-team
          // Map them to the real workspace IDs from the sessions
          const personas = useUserStore.getState().personas;
          const workspaceMap: Record<string, string> = {};

          for (let i = 0; i < personas.length; i++) {
            const persona = personas[i];
            const personaSession = sessions[persona.id];
            if (!personaSession) continue;
            const privateWs = personaSession.privateWorkspaces[0];
            if (privateWs) {
              workspaceMap[`mock-ws-private-${i}`] = privateWs._id;
            }
            const sharedWs = personaSession.sharedWorkspaces[0];
            if (sharedWs) {
              workspaceMap["mock-ws-shared-team"] = sharedWs._id;
            }
          }

          await usePageStore.getState().seedOnlinePages(workspaceMap, jwt);
        }
      })
      .finally(() => setReady(true));
  }, [initUsers, initialized]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--color-surface-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
          <p className="text-sm text-[var(--color-ink-muted)]">Signing in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-surface-primary)]">
      {/* Left sidebar (240 px) */}
      <NotionSidebar
        onOpenHome={() => usePageStore.setState({ activePage: null })}
      />

      {/* Content area */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        <MainContent />
      </main>
    </div>
  );
};

export default App;
