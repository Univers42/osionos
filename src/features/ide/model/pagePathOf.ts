/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pagePathOf.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { pageIndexFor } from "@/features/page-file/model/pageIndexCache";

const NO_PAGES: readonly PageEntry[] = [];

// Store glue only: the path logic is pageIndexFor, tested store-free in
// page-path-of.test.ts (canvas tests cannot load the store's JSON seed). Keyed by
// workspace id like usePageIndex, so the explorer and these share one index.

/** The one file path of a page (LSP URI, sandbox mirror, run task); "" when archived,
 *  unreadable or unknown. Read it at call time: a retitle or move changes it. */
export function pagePathOf(pageId: string): string {
  const store = usePageStore.getState();
  const workspaceId = store.pageById(pageId)?.workspaceId;
  if (!workspaceId) return "";
  return pageIndexFor(workspaceId, store.pages[workspaceId] ?? NO_PAGES).pathForId(pageId) ?? "";
}

/** The page at a workspace-relative path — the inverse of pagePathOf. */
export function pageIdAtPath(workspaceId: string, relPath: string): string | undefined {
  return pageIndexFor(workspaceId, usePageStore.getState().pages[workspaceId] ?? NO_PAGES).idForPath(relPath);
}
