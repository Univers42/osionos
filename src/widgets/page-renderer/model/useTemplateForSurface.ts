/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTemplateForSurface.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { getActivePageJwt } from "@/shared/api/client";

/** The admin-authored shell surfaces, each driven by a real template PAGE. */
export type TemplateSurface = NonNullable<PageEntry["templateSurface"]>;

/** Find the template page for a surface across all loaded workspaces. Reuses the
 *  EXISTING `isTemplate` + `templateSurface` mechanism — no env ids, no second
 *  registry. The admin authors one template page per surface (in the admin
 *  workspace) and tags it; this resolves it wherever it's loaded. */
function findSurfaceTemplate(pages: Record<string, PageEntry[]>, surface: TemplateSurface): PageEntry | undefined {
  for (const list of Object.values(pages)) {
    const hit = list.find((page) => page.templateSurface === surface && page.isTemplate && !page.archivedAt);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Resolve a surface's admin-authored template block content. Force-loads it on
 * mount (the lazy CONTENT_UNLOADED sentinel must never render an empty shell).
 * Returns null when no such template exists — the caller falls back to its
 * built-in view, so every surface stays non-breaking.
 */
export function useTemplateForSurface(surface: TemplateSurface): Block[] | null {
  const page = usePageStore((s) => findSurfaceTemplate(s.pages, surface));
  const fetchPageContent = usePageStore((s) => s.fetchPageContent);
  const pageId = page?._id;
  const hasContent = Array.isArray(page?.content);
  useEffect(() => {
    const jwt = getActivePageJwt();
    if (pageId && !hasContent && jwt) fetchPageContent(pageId, jwt);
  }, [pageId, hasContent, fetchPageContent]);
  return hasContent ? (page?.content as Block[]) : null;
}
