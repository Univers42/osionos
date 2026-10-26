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
 */

import { getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

/** The tools whose write changes the content of a page. */
const CONTENT_TOOLS: ReadonlySet<string> = new Set(["add_blocks"]);

/** Reads the page again when the executed tool changed its content; true when it asked. */
export function reloadWrittenPage(
  tool: string,
  pageId: string,
  jwt: string | null = getActivePageJwt(),
): boolean {
  if (!CONTENT_TOOLS.has(tool) || !pageId || !jwt) return false;
  void usePageStore.getState().fetchPageContent(pageId, jwt);
  return true;
}
