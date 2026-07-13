/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collectPages.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Gathers the export set from the page store: the root page and (optionally)
// its whole subtree, depth-first in sidebar order, with every page's block
// content loaded (lazy pages fetch through the store before serializing).

import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page";
import type { ExportPageNode } from "./exportTypes";

interface CollectInput {
  pageId: string;
  workspaceId: string;
  jwt: string;
  includeSubpages: boolean;
}

function childrenOf(all: PageEntry[], parentId: string): PageEntry[] {
  return all.filter((page) => page.parentPageId === parentId && !page.archivedAt);
}

export async function collectExportPages(input: CollectInput): Promise<ExportPageNode[]> {
  const store = usePageStore.getState();
  const all = store.pages[input.workspaceId] ?? [];
  const root = store.pageById(input.pageId);
  if (!root) throw new Error("Page not found in this workspace.");

  const ordered: Array<{ entry: PageEntry; chain: string[] }> = [];
  const walk = (entry: PageEntry, chain: string[], seen: Set<string>) => {
    if (seen.has(entry._id)) return;
    seen.add(entry._id);
    ordered.push({ entry, chain });
    if (!input.includeSubpages) return;
    for (const child of childrenOf(all, entry._id)) {
      walk(child, [...chain, entry.title || "Untitled"], seen);
    }
  };
  walk(root, [], new Set());

  // Load lazy content sequentially — export is a user-invoked bulk action and
  // a small burst; sequential keeps the bridge happy (see outbox-storm rule).
  for (const { entry } of ordered) {
    if (entry.content === undefined) {
      try {
        await store.fetchPageContent(entry._id, input.jwt);
      } catch {
        // Export what we have; a missing subtree body becomes an empty page.
      }
    }
  }

  const fresh = usePageStore.getState();
  return ordered.map(({ entry, chain }) => ({
    id: entry._id,
    title: entry.title || "Untitled",
    blocks: fresh.pageById(entry._id)?.content ?? [],
    chain,
  }));
}
