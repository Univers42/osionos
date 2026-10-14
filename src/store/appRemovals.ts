/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appRemovals.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pages this tab's user archived or deleted in the app, recorded by the store once the server has
// confirmed (pageStore.actions applyCascadeOperation, and its local-only branches). The page-file
// writer removes a page's file only for one of these (usePageFileWriter, outboundRun mayRemove).
// A page that only disappeared on a refetch has none, so its file stays: the shell deleted it,
// another tab or device did, or a big-folder cascade the server committed in part before
// answering 5xx. Each of those once read an agreement that was stale in this tab as a match for
// the bytes a `git clone` had just put back, and removed the clone (devil P1, H1, R1,
// 2026-10-14). The leadership gate this replaces left the hole open in a successor tab.
// An intent is spent by the round that plans its remove, a shell mark spending it too and
// winning; it is dropped when its page is seen live again, and a writer that starts clears its
// workspace's (its baseline already holds those removals, so none could be planned).
// Ponytail: memory only, so a reload or a sandbox health flap between the app archive and the
// writer's round (800 ms) leaves the file in the sandbox; so does an archive made in another
// tab or on another device.
// Those files have no page, and an attach adopts none: the writer's Output line counts them.
// An app archive racing a shell re-clone of the same path inside that round (about 1 s) still
// removes the clone if its bytes equal the agreement: the user asked for that page to go.

const intents = new Map<string, Set<string>>();

export function recordAppRemovals(workspaceId: string, pageIds: Iterable<string>): void {
  let ids = intents.get(workspaceId);
  if (ids === undefined) intents.set(workspaceId, (ids = new Set()));
  for (const id of pageIds) ids.add(id);
}

export function forgetAppRemovals(workspaceId: string, pageIds: Iterable<string>): void {
  const ids = intents.get(workspaceId);
  if (ids !== undefined) for (const id of pageIds) ids.delete(id);
}

/** True once for a page this tab's user removed; the intent is gone after. */
export function takeAppRemoval(workspaceId: string, pageId: string): boolean {
  return intents.get(workspaceId)?.delete(pageId) ?? false;
}

export function clearAppRemovals(workspaceId: string): void {
  intents.delete(workspaceId);
}

/** Drops the intent of every page seen live again (a restore, a refetch, the shell). O(intents). */
export function forgetLiveAppRemovals(workspaceId: string, isLive: (pageId: string) => boolean): void {
  const ids = intents.get(workspaceId);
  if (ids !== undefined) for (const id of ids) if (isLive(id)) ids.delete(id);
}
