/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openCitation.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Opening a source: the page it is in, and the block it points at.
 *
 * The app already knows how to open a page and scroll to a block — the search
 * panel and the tasks panel do it the same way. This is that navigation, with
 * the source's own ids.
 */

import { usePageStore } from "@/store/usePageStore";
import type { Citation } from "./citations";

/** Opens the page of a source, and scrolls to its block when it has one. */
export function openCitation(citation: Citation): void {
  const store = usePageStore.getState();
  const page = store.pageById(citation.pageId);
  store.openPage({
    id: citation.pageId,
    workspaceId: page?.workspaceId ?? "",
    kind: page?.databaseId ? "database" : "page",
    title: page?.title ?? citation.title,
    icon: page?.icon,
    databaseId: page?.databaseId,
  });
  if (!citation.blockId) return;
  // The page needs a moment to mount before its blocks are in the DOM.
  setTimeout(() => {
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]")).find(
      (element) => element.dataset.blockId === citation.blockId,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}
