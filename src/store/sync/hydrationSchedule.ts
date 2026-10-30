/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hydrationSchedule.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Workspaces other than the active one load this many at a time: the api client has six
 *  slots, and firing every workspace at once (16 on a real account) queued the page the
 *  user opened behind all of them. */
const BACKGROUND_WIDTH = 2;

/**
 * Hydrate the workspace on screen first and alone, then the others BACKGROUND_WIDTH at a
 * time. A failure is skipped (the outbox and the next hydrate reconcile it); the answer is
 * the sum of what the successful ones changed.
 */
export async function hydrateActiveFirst(
  workspaceIds: readonly string[],
  activeWorkspaceId: string,
  hydrate: (workspaceId: string) => Promise<number>,
): Promise<number> {
  const settle = (workspaceId: string) => hydrate(workspaceId).catch(() => 0);
  let changed = 0;
  const rest = [...workspaceIds];
  const activeAt = rest.indexOf(activeWorkspaceId);
  if (activeAt >= 0) changed += await settle(rest.splice(activeAt, 1)[0]);
  const worker = async () => {
    // Read the count after the await: `changed += await …` reads it before, and the two
    // workers would overwrite each other's additions.
    for (let next = rest.shift(); next !== undefined; next = rest.shift()) {
      const count = await settle(next);
      changed += count;
    }
  };
  await Promise.all(Array.from({ length: Math.min(BACKGROUND_WIDTH, rest.length) }, worker));
  return changed;
}
