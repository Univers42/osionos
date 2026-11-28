/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   devRoutes.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { lazy, Suspense } from "react";
import { contentFallback } from "./contentFallback";

/** Dev-only routes (canvas debug, style guide); the sign-in gate loads them, the signed-in app never does. */
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

export function LazyCanvasDebugRoute() {
  return <Suspense fallback={contentFallback}>{<CanvasDebugRouteImpl />}</Suspense>;
}

export function LazyStyleGuideRoute() {
  return <Suspense fallback={contentFallback}>{<StyleGuideRouteImpl />}</Suspense>;
}
