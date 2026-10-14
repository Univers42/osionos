/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moveBreadcrumbs.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/**
 * "Workspace / Ancestor / … / Page" — the path the move dialog shows beside a search
 * result. Stops at the first page already on the path, so a parentPageId cycle in the
 * loaded pages ends the walk (as PageBreadcrumbs does).
 */
export function buildMoveBreadcrumbs(
  pageId: string,
  workspaceId: string,
  pages: readonly PageEntry[],
  workspaces: ReadonlyArray<{ _id: string; name: string }>,
): string {
  const path: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null | undefined = pageId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const page = pages.find((p) => p._id === currentId);
    if (page) {
      path.unshift(page.title || "Untitled");
      currentId = page.parentPageId;
    } else {
      currentId = null;
    }
  }

  const ws = workspaces.find((w) => w._id === workspaceId);
  if (ws) path.unshift(ws.name);

  return path.join(" / ");
}
