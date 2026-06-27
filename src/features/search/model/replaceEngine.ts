/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   replaceEngine.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { buildMatcher } from "../lib/matcher";
import { replaceInBlocks } from "../lib/blockSearch";
import type { PageGroup, SearchOptions } from "./resultModel";
import { useReplaceUndoStore } from "./replaceUndoStore";

export interface ReplaceSummary {
  pages: number;
  matches: number;
  skipped: number;
}

/**
 * Replace every match across the given (already-found) pages. Loads content for
 * any page whose body isn't in memory FIRST (the outbox omits undefined content,
 * so an unloaded page would silently no-op), respects canEditPage + archived,
 * writes via updatePageContent (reuses the existing outbox sync), and snapshots
 * prior content for a single-level undo.
 */
export async function replaceAll(
  query: string,
  replacement: string,
  preserveCase: boolean,
  opts: SearchOptions,
  groups: PageGroup[],
): Promise<ReplaceSummary> {
  const built = buildMatcher(query, opts);
  if (!built.ok) return { pages: 0, matches: 0, skipped: 0 };
  const { regex } = built;

  const ctx = getCurrentPageAccessContext();
  const jwt = useUserStore.getState().activePageJwt() ?? "";
  const targets = groups.filter((group) => group.editable && !group.archived);

  const snapshots: Record<string, Block[]> = {};
  let pages = 0;
  let matches = 0;
  for (const group of targets) {
    let entry = usePageStore.getState().pageById(group.pageId);
    if (entry && entry.content === undefined && jwt) {
      await usePageStore.getState().fetchPageContent(group.pageId, jwt);
      entry = usePageStore.getState().pageById(group.pageId);
    }
    if (!entry || !entry.content || !canEditPage(entry, ctx)) continue;
    const before = entry.content;
    const { blocks, count } = replaceInBlocks(before, regex, replacement, preserveCase);
    if (count === 0) continue;
    snapshots[group.pageId] = structuredClone(before);
    usePageStore.getState().updatePageContent(group.pageId, blocks);
    pages += 1;
    matches += count;
  }

  if (pages > 0) {
    useReplaceUndoStore.getState().capture(snapshots, `Replaced ${matches} in ${pages} page(s)`);
  }
  return { pages, matches, skipped: groups.length - targets.length };
}
