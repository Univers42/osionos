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
const MainContentImpl = lazy(() =>
  import("@/widgets/page-renderer").then((module) => ({ default: module.MainContent })),
);

const CanvasDebugRouteImpl = lazy(() =>
  import("@/features/block-editor/ui/canvas/__demo__/CanvasDebugRoute").then((module) => ({
    default: module.CanvasDebugRoute,
  })),
);

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
