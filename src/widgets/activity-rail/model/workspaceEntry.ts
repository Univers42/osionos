/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceEntry.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { pageIndexFor } from "@/features/page-file/model/pageIndexCache";

/**
 * Normalise a workspace-relative path: strip leading/trailing "/" and collapse "//".
 * "" → "" (caller treats as undefined).
 * O(path.length).
 */
function normaliseRelPath(relPath: string): string {
  return relPath.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

/**
 * Find the page ID for a workspace-relative path.
 * Uses the cached index from `pageIndexFor` (never calls `buildPageIndex` directly).
 * Returns undefined for unknown paths, "" after normalisation, or archived pages.
 * O(1) map hit on a warm cache; first call after structural change pays O(n log n) in pageIndexFor.
 */
export function pageIdForEntry(
  workspaceId: string,
  pages: readonly PageEntry[],
  relPath: string,
): string | undefined {
  const normalised = normaliseRelPath(relPath);
  if (normalised === "") return undefined;
  const index = pageIndexFor(workspaceId, pages);
  return index.idForPath(normalised);
}