/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   searchEngine.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { collectPanes } from "@/widgets/workspace-grid/model/layoutTree";
import { canEditPage, canReadPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { buildMatcher } from "../lib/matcher";
import { findInBlocks, titleMatch } from "../lib/blockSearch";
import type { BlockMatch, PageGroup, SearchOptions } from "./resultModel";

/** Bound the work: never scan more than this many pages in one search. */
const MAX_PAGES = 300;

function globToRegExp(glob: string): RegExp | null {
  const trimmed = glob.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  try {
    return new RegExp(escaped, "i");
  } catch {
    return null;
  }
}

/**
 * Find across the active workspace. Client-side over the page tree: titles are
 * always available; block content is lazily fetched per candidate page (the
 * server-side block index is a deferred scale optimization — see plan). The
 * matcher is shared with replace, so previews match what a replace would change.
 */
export async function searchWorkspace(
  query: string,
  opts: SearchOptions,
  isCancelled: () => boolean = () => false,
): Promise<PageGroup[]> {
  const built = buildMatcher(query, opts);
  if (!built.ok) return [];
  const { regex } = built;

  const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
  if (!workspaceId) return [];
  const jwt = useUserStore.getState().activePageJwt() ?? "";
  const ctx = getCurrentPageAccessContext();

  const include = globToRegExp(opts.includeGlob);
  const exclude = globToRegExp(opts.excludeGlob);
  const openIds = opts.openEditorsOnly
    ? new Set(collectPanes(useWorkspaceLayout.getState().root).flatMap((pane) => pane.tabs.map((tab) => tab.pageId)))
    : null;

  const candidates = usePageStore
    .getState()
    .pagesForWorkspace(workspaceId)
    .filter((page) => !page.archivedAt && canReadPage(page, ctx))
    .filter((page) => (openIds ? openIds.has(page._id) : true))
    .filter((page) => (include ? include.test(page.title || "") : true))
    .filter((page) => (exclude ? !exclude.test(page.title || "") : true))
    .slice(0, MAX_PAGES);

  const groups: PageGroup[] = [];
  for (const page of candidates) {
    if (isCancelled()) return groups;
    let entry = usePageStore.getState().pageById(page._id) ?? page;
    if (entry.content === undefined && jwt) {
      await usePageStore.getState().fetchPageContent(page._id, jwt);
      entry = usePageStore.getState().pageById(page._id) ?? entry;
    }
    const matches: BlockMatch[] = [];
    for (const m of titleMatch(entry.title || "", regex)) {
      matches.push({ blockId: "", before: "", hit: m.full, after: "  ·  title" });
    }
    if (entry.content) matches.push(...findInBlocks(entry.content, regex));
    if (matches.length === 0) continue;
    groups.push({
      pageId: entry._id,
      workspaceId,
      title: entry.title || "Untitled",
      editable: canEditPage(entry, ctx),
      archived: Boolean(entry.archivedAt),
      matchCount: matches.length,
      matches,
    });
  }
  return groups;
}
