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
import { pageIdAtPath } from "./pagePathOf";

/** The page behind a workspace-relative file path (`src/main.c`), or null. The
 *  inverse of pagePathOf — used to route a cross-file go-to-definition back to
 *  the page it should open. O(1) on a warm page index. */
export function findPageByRelPath(workspaceId: string, relPath: string): { id: string; title: string } | null {
  const id = pageIdAtPath(workspaceId, relPath);
  const page = id ? usePageStore.getState().pageById(id) : undefined;
  return page ? { id: page._id, title: page.title } : null;
}
