/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moveTree.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isValidMove } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page";

export interface RenderableItem {
  id: string | null;
  workspaceId: string;
  title: string;
  type: "page" | "root";
  depth?: number;
  icon?: string;
  hasChildren?: boolean;
  breadcrumbs?: string;
}

/** The move dialog's tree: each workspace root, then its pages depth-first, minus the source
 *  page, its descendants and (for a page that is not the user's) private workspaces. */
export function buildMovePageItems(
  pages: Record<string, PageEntry[]>,
  workspaces: Array<{ _id: string; name: string }>,
  sourcePageId: string,
  privateWorkspaceIds: string[],
  sourceOwnerId: string | null | undefined,
  currentUserId: string,
): RenderableItem[] {
  const items: RenderableItem[] = [];

  const recurse = (
    workspaceId: string,
    parentId: string | null = null,
    depth = 0,
  ) => {
    const wsPages = pages[workspaceId] ?? [];
    const children = wsPages.filter((p) => p.parentPageId === parentId);

    children.forEach((page) => {
      if (
        page._id === sourcePageId ||
        !isValidMove(pages, sourcePageId, page._id)
      ) {
        return;
      }

      const hasChildren = wsPages.some((p) => p.parentPageId === page._id);
      items.push({
        id: page._id,
        workspaceId,
        title: page.title || "Untitled",
        type: "page",
        depth,
        icon: page.icon,
        hasChildren,
      });

      recurse(workspaceId, page._id, depth + 1);
    });
  };

  workspaces.forEach((ws) => {
    // Hide private workspace roots when the page isn't owned by current user
    const isPrivate = privateWorkspaceIds.includes(ws._id);
    if (isPrivate && sourceOwnerId && sourceOwnerId !== currentUserId) {
      return;
    }

    items.push({
      id: null,
      workspaceId: ws._id,
      title: `Move to ${ws.name} Root`,
      type: "root",
      depth: 0,
    });
    recurse(ws._id);
  });

  return items;
}
