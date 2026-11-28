/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SignedInApp.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React, { useEffect, type MutableRefObject } from "react";

import { useUserStore } from "@/features/auth/model/useUserStore";
import { usePageSync } from "@/store/sync/usePageSync";
import { useUnreadSync } from "@/store/chat/useUnreadSync";
import { useNotifyLive } from "@/store/chat/useNotifyLive";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { usePresenceHeartbeat } from "@/shared/people/usePresenceHeartbeat";
import { useZenMode } from "@/shared/config/useZenMode";
import { useUIStore } from "@/shared/config/uiStore";
import { useTemplateRecurrence } from "@/store/sync/templateRecurrence";
import { usePageStore } from "@/store/usePageStore";
import type { ActivePage } from "@/entities/page";
import { useLayoutPagePrune } from "@/widgets/workspace-grid/model/useLayoutPagePrune";
import { useNavHistoryRecorder } from "@/widgets/workspace-grid/model/useNavHistory";
import { useDocumentTitle } from "@/widgets/workspace-grid/model/tabTitle";
import { SidebarHosts } from "./SidebarHosts";
import { LazyMachineView, LazyWorkbench } from "./lazyAppRegions";
import { syncObjectDbForAccount } from "./objectDbAccountSync";
import { ShellHosts } from "./ShellHosts";
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
import { setInferencePort } from "@/features/chat/model/useChatStore";
import { selectInferencePort } from "@/features/ai/model/aiInferencePort";

// The Assistant pane talks to a port chosen once, when this chunk loads: the AI service when a
// base URL is configured, the offline stub otherwise.
setInferencePort(selectInferencePort());

const LazyNoAccessScreen = React.lazy(() =>
  import("@/features/page-link/NoAccessScreen").then((module) => ({ default: module.NoAccessScreen })),
);

export type SignedInAppProps = {
  /** The page the user was last on, read before any init effect could reset it. */
  persistedActivePage: ActivePage | null;
  /** The account the object-database sync last ran for; owned by App so it outlives a sign-out. */
  objectDbPrevUser: MutableRefObject<string | null>;
};

/**
 * Everything that only exists once a session does: the page and chat syncs, the automation
 * hooks, the top bar, sidebars and the workbench. App loads it lazily, so the sign-in
 * screen's chunk graph holds none of it.
 */
function useSignedInServices({ persistedActivePage, objectDbPrevUser }: SignedInAppProps) {
  const activeUserId = useUserStore((s) => s.activeUserId);
  const seeded = usePageStore((s) => s.seeded);
  useEffect(() => {
    if (readOAuthReturn(globalThis.location?.href ?? "")) openSettings("ai_connections");
  }, []);
  usePageSync();
  useNavHistoryRecorder();
  useLayoutPagePrune();
  useDocumentTitle();
  useUnreadSync();
  useNotifyLive();
  useConnectivityNotices();
  usePresenceHeartbeat();
  useTemplateRecurrence();
  useResponsiveSidebar();
  useAutomationDispatcher();
  useVariablesSync();
  useDatabaseAutomationBridge();
  useEffect(() => {
    if (activeUserId) void useFavoritesStore.getState().hydrate();
  }, [activeUserId]);
  useEffect(() => {
    return syncObjectDbForAccount(
      () => import("@/widgets/database-view/model/knownDatabaseState"),
      objectDbPrevUser,
      activeUserId,
    );
  }, [activeUserId, objectDbPrevUser]);
  useEffect(() => {
    if (!seeded || !persistedActivePage) return;
    const store = usePageStore.getState();
    if (store.activePage || store.showTrash) return;
    if (store.pageById(persistedActivePage.id)) store.openPage(persistedActivePage);
  }, [seeded, persistedActivePage]);
}

export default function SignedInApp(props: SignedInAppProps) {
  useSignedInServices(props);
  const zen = useZenMode((s) => s.zen);
  const topBarAutoHide = useUIStore((s) => s.topBarAutoHide);
  const deniedPageId = usePageStore((s) => s.deniedPage?.pageId ?? null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const onOpenSettings = () => openSettings();

  if (globalThis.location?.pathname === "/machine") return <LazyMachineView />;
  if (isPhone) return <PhoneApp />;

  return (
    <BindingSourcesProvider>
      <div
        data-testid="app-shell"
        data-osio-shell
        data-zen={zen ? "1" : undefined}
        data-topbar-autohide={topBarAutoHide ? "1" : undefined}
        className="relative flex flex-col h-screen w-screen overflow-hidden bg-[var(--osio-bg-canvas)]"
      >
        <a
          href="#osio-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--osio-bg-page)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--osio-fg-default)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          Skip to content
        </a>

        <TopBar onOpenSettings={openSettings} />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <SidebarHosts edge="left" onOpenSettings={onOpenSettings} />

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
}
