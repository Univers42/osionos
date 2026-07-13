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
