/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabasePushBaseline.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 13:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 13:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The hash of each database as THIS tab last pushed or pulled it: local equals
// it ⇒ the tab's copy is clean and a server copy may replace it. It used to be
// read from localStorage on every pull, but localStorage is shared by every tab
// while each tab's state lives in its own memory. Tab X stored its hash, tab Y
// compared its own state with X's hash, saw "dirty", kept its schema and pushed
// it; X then did the same. Two open tabs overwrote each other's database every
// ~3 s, forever (live, db-92886044, 2026-10-26). localStorage now only seeds a
// tab's baseline once, at creation (= tab load), so a reload still knows what
// its persisted copy was. Seeding lazily would re-open the bug: the first pull
// may come after another tab already wrote its hash.

export interface PushBaselineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PushBaseline {
  load(): Record<string, string>;
  save(map: Record<string, string>): void;
  reset(): void;
}

export const PUSHED_HASHES_KEY = "osionos.objectDb.pushed.v1";

function readStored(storage: () => PushBaselineStorage | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(storage()?.getItem(PUSHED_HASHES_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function createPushBaseline(storage: () => PushBaselineStorage | undefined): PushBaseline {
  let own = readStored(storage);
  return {
    load: () => ({ ...own }),
    save: (map) => {
      own = { ...map };
      try {
        storage()?.setItem(PUSHED_HASHES_KEY, JSON.stringify(own));
      } catch {
        // localStorage can be unavailable or quota-limited — the tab's own copy still holds.
      }
    },
    reset: () => {
      own = {};
      try {
        storage()?.removeItem(PUSHED_HASHES_KEY);
      } catch {
        // localStorage may be unavailable — the baseline just recomputes.
      }
    },
  };
}
