/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fakeLocks.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { LockManagerLike } from "../../../src/features/ide/model/inboundPipeline.ts";

/** A FIFO LockManager: grants the lock to waiters in request order, granting
 *  asynchronously like the real API, and hands it over when the holder's
 *  callback promise settles. */
export function createFakeLocks() {
  const names: string[] = [];
  const waiting: Array<{ callback: () => Promise<void>; resolve: () => void }> = [];
  let holding = false;

  const grantNext = (): void => {
    if (holding) return;
    const entry = waiting.shift();
    if (!entry) return;
    holding = true;
    void entry.callback().then(() => {
      holding = false;
      entry.resolve();
      grantNext();
    });
  };

  const locks: LockManagerLike = {
    request(name: string, _options: { mode: "exclusive" }, callback: () => Promise<void>): Promise<void> {
      names.push(name);
      const pending = new Promise<void>((resolve) => {
        waiting.push({ callback, resolve });
      });
      queueMicrotask(grantNext); // the real API grants on a later tick
      return pending;
    },
  };

  return { locks, names };
}
