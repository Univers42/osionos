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

// Unified workbench (grid + dock + status bar). Own chunk.
const WorkbenchImpl = lazy(() =>
  import("@/widgets/workbench/ui/Workbench").then((module) => ({ default: module.Workbench })),
);

// Warm the workbench SHELL (it statically holds the grid + panes) in parallel with
// the entry bundle so it is ready by the time auth resolves -- removes the lazy-load
// waterfall from LCP without putting the editor back on the critical path. Deep path
// so we warm only the shell, never the block-editor tree (that loads when a page opens).
void import("@/widgets/workbench/ui/Workbench");

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
  // "graph" is a graph surface in every build (legacy or graph_render), never the editor.
  if (linked) return linked === "dashboard";
  const stored = globalThis.localStorage?.getItem("osionos.home.variant");
  return stored !== "database" && stored !== "graph";
}

if (initialSurfaceUsesEditor()) {
  const warmEditor = (): void => { void import("@/pages/notion-page/ui/NotionPage"); };
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(warmEditor, { timeout: 2500 });
  } else {
    globalThis.setTimeout(warmEditor, 1200);
  }
}

// A ?settings=<section>#<anchor> link opens the settings tab at that anchor.
// Read next to the ?home= link above: both are one-shot boot deep links. The
// dynamic import keeps the settings registry out of the entry chunk; the link
// drops itself from the URL, so a reload does not reopen it.
if (globalThis.window !== undefined) {
  void import("@/features/settings/model/settingsDeepLink").then((module) => module.applySettingsDeepLink());
}

// A ?u=<username> link opens that member's profile tab, once, the same way.
if (globalThis.window !== undefined) {
  void import("@/widgets/profile-page/model/profileDeepLink").then((module) => module.applyProfileDeepLink());
}

// A ?invite=<token> link accepts that workspace invite once the session resolves.
if (globalThis.window !== undefined) {
  void import("@/features/settings/people/inviteDeepLink").then((module) => module.applyInviteDeepLink());
}

const contentFallback = (
  <div className="flex h-full w-full items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
  </div>
);

export function LazyCanvasDebugRoute() {
  return <Suspense fallback={contentFallback}>{<CanvasDebugRouteImpl />}</Suspense>;
}

export function LazyStyleGuideRoute() {
  return <Suspense fallback={contentFallback}>{<StyleGuideRouteImpl />}</Suspense>;
}

export function LazyWorkbench() {
  return <Suspense fallback={contentFallback}>{<WorkbenchImpl />}</Suspense>;
}
