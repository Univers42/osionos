/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lazyAppRegions.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { lazy, Suspense } from "react";

/**
 * Code-split the heavy editor / page-renderer subtree (block editor, katex,
 * table & canvas editors, …) and the dev-only canvas debug route out of the
 * entry chunk. The app shell (sidebar + auth) paints from the small entry
 * bundle while these regions stream in on demand.
 */
// Import MainContent from its deep path, NOT the barrel: the barrel re-exports
// PageBlocksRenderer, which statically pulls ReadOnlyBlock -> block-editor +
// database-view (~1.1MB). Going through the barrel stapled that whole editor
// tree onto the warm chunk; the deep path keeps the warm shell tiny and lets the
// editor load on demand (when a page/dashboard actually mounts OsionosPage).
const MainContentImpl = lazy(() =>
  import("@/widgets/page-renderer/ui/MainContent").then((module) => ({ default: module.MainContent })),
);

const CanvasDebugRouteImpl = lazy(() =>
  import("@/features/block-editor/ui/canvas/__demo__/CanvasDebugRoute").then((module) => ({
    default: module.CanvasDebugRoute,
  })),
);

const StyleGuideRouteImpl = lazy(() =>
  import("@/app/__styleguide__/StyleGuideRoute").then((module) => ({
    default: module.StyleGuideRoute,
  })),
);

// Warm the page-renderer SHELL (grid + panes) in parallel with the entry bundle
// so it is ready by the time auth resolves -- removes the lazy-load waterfall
// from LCP without putting the editor back on the critical path. Deep path so we
// warm only the shell, never the block-editor tree (that loads when a page opens).
void import("@/widgets/page-renderer/ui/MainContent");

// Warm the page-editor chunk for the default Home view (it renders the dashboard
// *page*, OsionosPage). Without warming, the editor only requests after the
// entry + shell parse -- a 3-hop waterfall that dominated LCP. But warming it
// eagerly competes with the entry for a slow mobile pipe and pushes FCP back, so
// schedule it at idle: desktop fires within ms (editor ready well before LCP),
// while a throttled mobile CPU paints first, then preloads for the dashboard.
// Only the dashboard / page surfaces render the editor. Skip the warm for the
// graph / database / gallery Home variants so they don't pay the editor's parse
// cost (it measurably dragged those surfaces' mobile scores down). Mirrors the
// variant resolution in HomeTabView (?home= wins over the persisted choice).
function initialSurfaceUsesEditor(): boolean {
  if (globalThis.window === undefined) return false;
  const linked = new URLSearchParams(globalThis.location.search).get("home");
  if (linked) return linked === "dashboard";
  const stored = globalThis.localStorage?.getItem("osionos.home.variant");
  return stored !== "graph" && stored !== "database";
}

if (initialSurfaceUsesEditor()) {
  const warmEditor = (): void => { void import("@/pages/notion-page/ui/NotionPage"); };
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(warmEditor, { timeout: 2500 });
  } else {
    globalThis.setTimeout(warmEditor, 1200);
  }
}

const contentFallback = (
  <div className="flex h-full w-full items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
  </div>
);

export function LazyMainContent() {
  return <Suspense fallback={contentFallback}>{<MainContentImpl />}</Suspense>;
}

export function LazyCanvasDebugRoute() {
  return <Suspense fallback={contentFallback}>{<CanvasDebugRouteImpl />}</Suspense>;
}

export function LazyStyleGuideRoute() {
  return <Suspense fallback={contentFallback}>{<StyleGuideRouteImpl />}</Suspense>;
}
