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

import { useUserStore } from "@/features/auth/model/useUserStore";
import { isPortalMode } from "@/features/auth/model/userStore.helpers";
import { Portal } from "@/features/auth/ui/Portal";
import { loadActivePage } from "@/store/pageStore.helpers";
import { LazyCanvasDebugRoute, LazyStyleGuideRoute } from "./devRoutes";
import { PrivateWorkspaceScreen, SigningInScreen } from "./SessionGateScreens";
import { startDrawnCaret } from "@/features/theme/model/drawnCaret";
import { applyStoredAppearance, watchSystemTheme } from "@/shared/config/theme";
import { applyStoredTheme } from "@/shared/config/themeApply";

const LazySignedInApp = React.lazy(() => import("./SignedInApp"));

function isDevCanvasDebugRoute() {
  if (!import.meta.env.DEV || globalThis.window === undefined) return false;
  return globalThis.window.location.pathname === "/__canvas-debug" || globalThis.window.location.hash.includes("__canvas-debug");
}

function isDevStyleGuideRoute() {
  if (!import.meta.env.DEV || globalThis.window === undefined) return false;
  return globalThis.window.location.pathname === "/__styleguide";
}

/**
 * Root of the Playground app, and the sign-in gate.
 *
 * On mount `useUserStore.init()` resolves the session: bridge handoff, or the pre-seeded
 * accounts offline. Only once a session exists is the signed-in app (`SignedInApp`, its own
 * chunk graph with the pages, databases and workbench) downloaded, so the sign-in screen
 * ships none of it. A mount with no active user loads no page store or seed at all.
 */
const App: React.FC = () => {
  const initUsers = useUserStore((s) => s.init);
  const initialized = useUserStore((s) => s.initialized);
  const error = useUserStore((s) => s.error);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const [persistedActivePage] = useState(() => loadActivePage());
  const objectDbPrevUser = useRef<string | null>(null);

  useEffect(() => startDrawnCaret(), []);

  useEffect(() => {
    applyStoredAppearance();
    applyStoredTheme();
    if (initialized) return;
    initUsers()
      .then(async () => {
        if (!useUserStore.getState().activeUserId) return;
        const { bootstrapSessions } = await import("./sessionBootstrap");
        await bootstrapSessions();
      })
      .catch(() => undefined);
  }, [initUsers, initialized]);

  useEffect(() => watchSystemTheme(), []);

  if (isDevCanvasDebugRoute()) return <LazyCanvasDebugRoute />;
  if (isDevStyleGuideRoute()) return <LazyStyleGuideRoute />;
  if (!initialized) return <SigningInScreen />;
  if (isPortalMode() && !activeUserId) return <Portal />;
  if (error === "bridge-session-required" || !activeUserId) return <PrivateWorkspaceScreen />;

  return (
    <React.Suspense fallback={<SigningInScreen />}>
      <LazySignedInApp persistedActivePage={persistedActivePage} objectDbPrevUser={objectDbPrevUser} />
    </React.Suspense>
  );
};

export default App;
