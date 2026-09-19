/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   favoritesScope.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure favorites scoping. No imports so it stays out of the api-client shell
// favoritesStore drags in — directly unit-testable in the canvas runner.

/**
 * Favorites are stored per-USER, but a starred page belongs to exactly one
 * workspace (its own). The sidebar must therefore scope the list to the active
 * workspace, or a star made in one workspace bleeds into every other. Keeps only
 * ids whose page lives in `workspaceId`. `workspaceOf` resolves a page's
 * workspace id, returning undefined when the page isn't loaded — then it's
 * hidden, which matches the pre-existing "unloaded favorites don't render".
 */
export function favoritesForWorkspace(
  pageIds: readonly string[],
  workspaceId: string,
  workspaceOf: (pageId: string) => string | undefined,
): string[] {
  if (!workspaceId) return [];
  return pageIds.filter((id) => workspaceOf(id) === workspaceId);
}

/** The id shape the bridge accepts — the same RFC-4122 test bridge-api.mjs runs. */
const SERVER_PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Whether a page id can be persisted server-side at all.
 *
 * `osionos_page_favorites.page_id` is a `uuid` column and the bridge rejects
 * anything else with 422 ("pageId must be a UUID"). A client-only page — one
 * that has never been written to osionos_pages — therefore CANNOT be starred on
 * the server. Without this test the store fires the write anyway, the optimistic
 * star flips back on the 422, and the failure is invisible: the observed symptom
 * was a star that never sticks and a console full of 422s from re-clicks.
 */
export function isServerPageId(pageId: string): boolean {
  return SERVER_PAGE_ID.test(pageId);
}
