/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openWorkspaceEntry.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useToastStore } from "@osionos/ui/primitives";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageIdForEntry } from "./workspaceEntry";

/**
 * Opens the page behind a workspace-relative path, the way a click in the legacy
 * page tree does (same ActivePage fields). `kind` is unused: pages and code files
 * resolve through the same page index; it stays for the explorer's onOpen signature.
 */
export function openWorkspaceEntry(relPath: string, kind: "page" | "code"): void {
  void kind;
  const workspace = useUserStore.getState().activeWorkspace();
  if (!workspace) return;
  const store = usePageStore.getState();
  const pageId = pageIdForEntry(workspace._id, store.pagesForWorkspace(workspace._id), relPath);
  const page = pageId ? store.pageById(pageId) : undefined;
  if (page) {
    store.openPage({
      id: page._id, workspaceId: workspace._id,
      kind: page.databaseId ? "database" : "page",
      title: page.title, icon: page.icon, databaseId: page.databaseId,
    });
    return;
  }
  useToastStore.getState().push({
    kind: "info",
    title: "Not a page yet",
    description: `${relPath} exists only in the sandbox; it becomes a page when the sandbox syncs it.`,
  });
}
