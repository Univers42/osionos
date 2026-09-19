/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFileLookup.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";
import { buildIdeFileTree, flattenIdeTree } from "./ideFileTree";
import { pathForPage } from "./idePaths";

/** The page behind a workspace-relative file path (`src/main.c`), or null. The
 *  inverse of pathForPage — used to route a cross-file go-to-definition back to
 *  the page it should open. Walks the current tree; fine for a workspace of
 *  hundreds of files, called once per navigation. */
export function findPageByRelPath(workspaceId: string, relPath: string): { id: string; title: string } | null {
  const pages = usePageStore.getState().pages[workspaceId];
  if (!pages) return null;
  const resolve = (id: string) => usePageStore.getState().pageById(id);
  for (const node of flattenIdeTree(buildIdeFileTree(pages))) {
    if (node.isFolder) continue;
    if (pathForPage(node.page._id, resolve) === relPath) return { id: node.page._id, title: node.page.title };
  }
  return null;
}
