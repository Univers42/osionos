/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cellPreview.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

export interface CellDatabasePreview {
  databaseId?: string;
  viewId?: string;
}

/** First database block found in a cell's nested content, for the deferred placeholder. */
export function blocksDatabasePreview(blocks: Block[] | undefined): CellDatabasePreview | null {
  if (!blocks) return null;
  for (const block of blocks) {
    if (block.type === "database_inline" || block.type === "database_full_page") {
      return { databaseId: block.databaseId, viewId: block.viewId };
    }
    const nested = blocksDatabasePreview(block.children);
    if (nested) return nested;
  }
  return null;
}

export function blocksHaveHeavyContent(blocks: Block[] | undefined): boolean {
  return Boolean(blocks?.some((block) => (
    block.type === "database_inline" ||
    block.type === "database_full_page" ||
    block.type === "graph_view" ||
    blocksHaveHeavyContent(block.children)
  )));
}
