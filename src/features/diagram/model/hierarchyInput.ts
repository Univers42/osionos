/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hierarchyInput.ts                                     +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pages a hierarchy diagram is drawn from (devil C110).
 *
 * A page tree is drawn from the pages the VIEWER may read. A page the viewer
 * may not read is simply ABSENT from the list: it never appears, not even as
 * an unnamed node, and a child whose parent is absent is not reachable either
 * — the tree has no hole to hang from.
 *
 * This file is PURE: it reads no store, no network and no clock. The block
 * slice adapts the page store to the little shape below.
 */

import type { HierarchyChild, HierarchyRoot } from "./compile";

/** The little a hierarchy needs to know about a page. */
export interface HierarchyPage {
  /** The page id (a uuid). */
  id: string;
  /** The title the box carries. */
  title: string;
  /** The id of the parent page; null for a root page. */
  parentId?: string | null;
  /** True when the page is archived: an archived page is not in the tree. */
  archived?: boolean;
}

/** What the hierarchy compiler needs: the root, and the flat children. */
export interface HierarchyInput {
  /** The root of the tree, or null when the root is not readable. */
  root: HierarchyRoot | null;
  /** The descendants, flat, each naming its parent. */
  children: HierarchyChild[];
}

/** The children of one parent, in one pass over the pages. */
function childrenByParent(pages: HierarchyPage[]): Map<string, HierarchyPage[]> {
  const byParent = new Map<string, HierarchyPage[]>();
  for (const page of pages) {
    if (page.archived) continue;
    const parentId = page.parentId;
    if (!parentId) continue;
    const list = byParent.get(parentId);
    if (list) list.push(page);
    else byParent.set(parentId, [page]);
  }
  return byParent;
}

/**
 * The input of `compileHierarchy`: the root and its descendants down to
 * `depth` levels.
 *
 * The root must be IN the list and not archived — a root the viewer may not
 * read gives an EMPTY input, never a root with no children. The walk is level
 * by level, so a page deeper than `depth` never appears, and a cycle (a page
 * that is its own ancestor) never loops.
 */
export function hierarchyInput(
  pages: HierarchyPage[],
  rootId: string,
  depth: number,
): HierarchyInput {
  const root = pages.find((page) => page.id === rootId && !page.archived);
  if (!root) return { root: null, children: [] };

  const byParent = childrenByParent(pages);
  const children: HierarchyChild[] = [];
  const seen = new Set([root.id]);
  let frontier = [root.id];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const child of byParent.get(parentId) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        children.push({ id: child.id, parentId, title: child.title });
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return { root: { id: root.id, title: root.title }, children };
}
