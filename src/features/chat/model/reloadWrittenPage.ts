/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reloadWrittenPage.ts                               :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The page an approved write changed, read again (devil C239).
 *
 * add_blocks writes on the server, not in the editor: without this the open
 * page keeps its old copy and its old base version, and its next save would
 * be made against a version the server no longer holds. `fetchPageContent`
 * sets the base to the server's copy and keeps an edit still pending.
 *
 * A write that changes a title, a setting, the archive state or adds pages
 * changes the sidebar instead (M14): the active workspace's list is pulled
 * again, forced past the 30 s freshness window that would otherwise skip it.
 */

import { useUserStore } from "@/features/auth";
import { getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

/** The tools whose write changes the content of a page. */
const CONTENT_TOOLS: ReadonlySet<string> = new Set(["add_blocks"]);

/** The tools whose write changes what the page list shows. */
const PAGE_LIST_TOOLS: ReadonlySet<string> = new Set([
  "create_page",
  "rename_page",
  "archive_page",
  "update_page_settings",
  "build_plan",
]);

// Caveat: only the ACTIVE workspace is pulled; a write landing in another
// workspace shows there on its next pull (switch, or the 30 s window).
function refreshPageList(jwt: string): void {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (workspaceId) void usePageStore.getState().fetchPages(workspaceId, jwt, true);
}

/** Reads again what the executed tool changed; true when it read the page's content. */
export function reloadWrittenPage(
  tool: string,
  pageId: string,
  jwt: string | null = getActivePageJwt(),
): boolean {
  if (!jwt) return false;
  if (PAGE_LIST_TOOLS.has(tool)) refreshPageList(jwt);
  if (!CONTENT_TOOLS.has(tool) || !pageId) return false;
  void usePageStore.getState().fetchPageContent(pageId, jwt);
  return true;
}
