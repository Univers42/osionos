/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebar-index.bench.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import type { PageAccessContext } from "../../src/shared/lib/auth/pageAccess.ts";
import { selectChildPageIds, selectRootPageIds } from "../../src/widgets/sidebar/ui/pageTreeItem.helpers.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench } from "./harness.ts";

const ACCESS: PageAccessContext = { userId: "u1", workspaceIds: ["ws"], privateWorkspaceIds: ["ws"], sharedWorkspaceIds: [] };

/** A workspace of `count` pages, a third of them roots, with a manual order. */
function workspace(count: number): PageEntry[] {
  return generatedTree(count).map((page, index) => ({ ...page, sortOrder: (index * 7919) % count, ownerId: "u1" }));
}

/** Two commits of the same workspace that differ in one page: by title (a keystroke) or by
 *  order (a structural change). Alternating them makes every call see a new array. The page is
 *  the first of the private root section, so moving it to the end really reorders. */
function alternating(count: number, change: (page: PageEntry) => PageEntry): () => readonly PageEntry[] {
  const first = workspace(count);
  const second = first.slice();
  let at = -1;
  first.forEach((page, index) => {
    if (page.parentPageId || page.archivedAt || page.surface !== "page") return;
    if (at === -1 || (page.sortOrder ?? 0) < (first[at].sortOrder ?? 0)) at = index;
  });
  second[at] = change(second[at]);
  let flip = false;
  return () => {
    flip = !flip;
    return flip ? first : second;
  };
}

const retitle = (page: PageEntry) => ({ ...page, title: `${page.title}!` });
const reorder = (page: PageEntry) => ({ ...page, sortOrder: Number.MAX_SAFE_INTEGER });

// Budgets ≈ 3x the p95 measured 2026-10-13: 4.5 µs after a title edit (the index is reused), 194
// µs for a real reorder (a rebuild). Before the incremental index every commit paid the rebuild
// in each of the four root-section selectors and once more for the children index.
export const bench = defineBench("sidebar index", [
  {
    name: "root section after a title edit: 5 000 pages",
    budgetNs: 15_000,
    setup: () => {
      const next = alternating(5_000, retitle);
      return () => selectRootPageIds(next(), "private", ACCESS, "ws");
    },
  },
  {
    name: "root section after a reorder (rebuild): 5 000 pages",
    budgetNs: 600_000,
    setup: () => {
      const next = alternating(5_000, reorder);
      return () => selectRootPageIds(next(), "private", ACCESS, "ws");
    },
  },
  {
    name: "children of a page after a title edit: 5 000 pages",
    budgetNs: 15_000,
    setup: () => {
      const next = alternating(5_000, retitle);
      return () => selectChildPageIds(next(), "p0", "ws");
    },
  },
]);
