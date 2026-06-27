/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   nodePreview.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { parseNodeId } from "@/features/second-brain/baas/buildRecordTxn";
import { api, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

const fetchedPages = new Map<string, PageEntry>();

/**
 * Resolve a graph NodeId to its backing page _id. BaaS note nodes are
 * `osionos:osionos_pages:<id>`; local notes `note:<id>`; tags / synthetic hubs
 * have no page (returns null). The page id is the part after the resource.
 */
export function pageIdFromNodeId(nodeId: string): string | null {
  if (nodeId.startsWith("note:")) return nodeId.slice(5) || null;
  if (nodeId.startsWith("tag:")) return null;
  const ref = parseNodeId(nodeId);
  if (ref.resource === "tags") return null;
  return ref.pk || null;
}

/**
 * Get a full page (with content) by id — store first, else fetch it from the
 * bridge. The graph shows EVERY workspace page, but the client store only holds
 * the loaded subset, so node previews/opens must fetch nested pages on demand
 * (the same reason top-bar search had to go server-side). Fetched pages are
 * memoised so re-hovering the same node never refetches.
 */
export async function loadPageById(pageId: string): Promise<PageEntry | null> {
  const cached = usePageStore.getState().pageById(pageId);
  if (cached && cached.content != null) return cached;
  const memo = fetchedPages.get(pageId);
  if (memo) return memo;
  try {
    const page = await api.get<PageEntry>(`/api/pages/${pageId}`, getActivePageJwt() ?? undefined);
    if (page) fetchedPages.set(pageId, page);
    return page ?? cached ?? null;
  } catch {
    return cached ?? null;
  }
}
