/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 18:59:04 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { lazy, Profiler, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { useMotionConfigMode } from "@/shared/config/useAppearance";
import App from "./App.tsx";
import { installPreloadRecovery, readSessionStorage } from "./preloadRecovery.ts";
import { setInferencePort } from "@/features/chat/model/useChatStore";
import { selectInferencePort } from "@/features/ai/model/aiInferencePort";
import { installLinkFaviconFallback } from "@/shared/lib/embed/linkFaviconFallback";
import { isWorkerReloadSafe, keepAppWorkerCurrent } from "@/shared/lib/service-worker/appWorker";

// Public published-page view (/p/:token) — a standalone read-only render mounted
// BEFORE the app + its auth so an unauthenticated visitor never boots the editor.
const LazyPublicPageView = lazy(() => import("@/pages/public/PublicPageView").then((m) => ({ default: m.PublicPageView })));
const isPublicRoute = globalThis.location?.pathname.startsWith("/p/") ?? false;
import { recordReactCommit } from '@osionos/perf-probe';
// Database (object-database) theme + leaflet styles ship with the lazy
// DatabaseBlock chunk (perf: off the render-blocking entry CSS), not here.
import './styles/_graphical-chart.scss';
import './styles/block-style.scss';
import './styles/fonts.css';
import './styles/global.css';

// The load-test/perf harness is a dev-only tool — keep its store/perf code out
// of the production entry bundle (cuts initial JS parse / TBT on mobile). A perf build
// (VITE_PERF_FIXTURES=true, set by PLAYWRIGHT_BUILD=production) keeps it, so the perf specs can
// measure the production code users run.
if (import.meta.env.DEV || import.meta.env.VITE_PERF_FIXTURES === 'true') {
  void import('@/shared/lib/perf/loadTest');
  void import('@/shared/lib/perf/perfFixtures');
}

// Self-recover from stale lazy chunks after a redeploy (see preloadRecovery.ts).
installPreloadRecovery(globalThis, {
  storage: readSessionStorage(),
  now: Date.now,
  reload: () => globalThis.location.reload(),
});

/** react-doctor/require-reduced-motion: honour the person's motion choice for
 *  every motion component (WCAG 2.3.3). The Appearance preference maps it —
 *  "system" is Motion's `reducedMotion="user"` (the OS decides), "reduce" is
 *  "always" and "full" is "never" — and the bridge re-renders on a change, so
 *  the choice takes effect without a reload. */
function AppearanceMotion({ children }: { children: ReactNode }) {
  const reducedMotion = useMotionConfigMode();
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}
// The Assistant pane talks to a port, chosen once and for all here: the AI
// service when a base URL is configured, the offline stub otherwise.
setInferencePort(selectInferencePort());
installLinkFaviconFallback();

// The offline app shell (#176): a reload without a connection opens the app. Not in dev,
// where a cached shell would fight Vite's module server.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  let userHasTyped = false;
  for (const type of ["keydown", "paste"]) {
    globalThis.addEventListener(type, () => { userHasTyped = true; }, { once: true, capture: true });
  }
  const reloadIfSafe = () => {
    const key = "osionos:worker-reloaded-at";
    const msSinceLastReload = Date.now() - Number(globalThis.sessionStorage?.getItem(key) ?? 0);
    if (!isWorkerReloadSafe({ address: globalThis.location.href, userHasTyped, msSinceLastReload })) return;
    globalThis.sessionStorage?.setItem(key, String(Date.now()));
    globalThis.location.reload();
  };
  globalThis.addEventListener("load", () => {
    keepAppWorkerCurrent(navigator.serviceWorker, reloadIfSafe)
      .catch((error: unknown) => console.warn("[osionos] offline shell unavailable:", error));
  });
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppearanceMotion>
        {/* Profiler only in dev: it wraps the whole tree and fires onRender on
            every commit — pure overhead (TBT) in production builds. */}
        {isPublicRoute ? (
          <Suspense fallback={null}>
            <LazyPublicPageView />
          </Suspense>
        ) : import.meta.env.DEV ? (
          <Profiler id="App" onRender={recordReactCommit}>
            <App />
          </Profiler>
        ) : (
          <App />
        )}
      </AppearanceMotion>
    </StrictMode>,
  );
}
