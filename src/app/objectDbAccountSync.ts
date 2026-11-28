/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDbAccountSync.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type ObjectDbSync = {
  resetObjectDatabaseSync: () => void;
  startObjectDatabaseSync: () => void;
};

/**
 * Starts the object-database sync for `accountId`, resetting it first when the account changed.
 * Returns the effect cleanup. A run whose cleanup has fired does nothing when its import lands:
 * each run issues its own `import()` and nothing orders their callbacks, so at boot the `""`
 * run used to land after the real id's, reset its live sync and leave the previous account at
 * `""`, which then skipped the next real switch's reset (ADR 0057).
 * The mark is a closure local on purpose: a flag in a ref is cleared by the next run before the
 * stale callback lands, and the stale callback acts again.
 * `isReady` (default true) says whether a sync can run at all; when it answers false the loader is
 * never called, so a build or session without a bridge does not download the database state.
 * Caveat: when several ids follow each other inside one import window, only the last one acts;
 * the ids in between are never started.
 */
export function syncObjectDbForAccount(
  loadSync: () => Promise<ObjectDbSync>,
  previousAccount: { current: string | null },
  accountId: string,
  isReady: () => boolean = () => true,
): () => void {
  if (!isReady()) return () => undefined;
  let isStale = false;
  void loadSync().then(({ resetObjectDatabaseSync, startObjectDatabaseSync }) => {
    if (isStale) return;
    if (previousAccount.current && previousAccount.current !== accountId) {
      resetObjectDatabaseSync();
    }
    previousAccount.current = accountId;
    startObjectDatabaseSync();
  });
  return () => {
    isStale = true;
  };
}
