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

import { lazy, Profiler, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App.tsx";

// Public published-page view (/p/:token) — a standalone read-only render mounted
// BEFORE the app + its auth so an unauthenticated visitor never boots the editor.
const LazyPublicPageView = lazy(() => import("@/pages/public/PublicPageView").then((m) => ({ default: m.PublicPageView })));
const isPublicRoute = globalThis.location?.pathname.startsWith("/p/") ?? false;
import { recordReactCommit } from '@/shared/lib/perf/measure';
// Database (object-database) theme + leaflet styles ship with the lazy
// DatabaseBlock chunk (perf: off the render-blocking entry CSS), not here.
import './styles/_graphical-chart.scss';
import './styles/global.css';

// The load-test/perf harness is a dev-only tool — keep its store/perf code out
// of the production entry bundle (cuts initial JS parse / TBT on mobile).
if (import.meta.env.DEV) {
  void import('@/shared/lib/perf/loadTest');
}

// Self-recover from stale lazy chunks after a redeploy: when a dynamic import
// 404s (its hashed file was replaced), Vite fires `vite:preloadError`. Reload
// once to pull the fresh manifest, guarded so a genuinely-missing chunk can't
// loop. Without this, an open tab keeps throwing "Failed to fetch dynamically
// imported module" for mermaid, the database view, etc.
globalThis.addEventListener("vite:preloadError", () => {
  const key = "osionos:preload-reloaded-at";
  const last = Number(globalThis.sessionStorage?.getItem(key) ?? 0);
  if (Date.now() - last > 10_000) {
    globalThis.sessionStorage?.setItem(key, String(Date.now()));
    globalThis.location.reload();
  }
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* react-doctor/require-reduced-motion: honour user's OS-level
          prefers-reduced-motion preference for every motion component (WCAG
          2.3.3). `reducedMotion="user"` is the recommended default. */}
      <MotionConfig reducedMotion="user">
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
      </MotionConfig>
    </StrictMode>,
  );
}
