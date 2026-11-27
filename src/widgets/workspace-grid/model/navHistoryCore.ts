/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   navHistoryCore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { WorkspaceTab } from "./layoutTree";

/** The visited pages, oldest first, and the one the user is on. */
export interface NavHistory {
  entries: readonly WorkspaceTab[];
  index: number;
}

/**
 * Ponytail: the cap is a fixed 50, a page revisited later is a second entry
 * (only a repeat of the current one is folded), and an entry is a tab snapshot,
 * so a renamed page reopens under its old title until the layout refreshes it.
 */
export const NAV_HISTORY_CAP = 50;

export function emptyHistory(): NavHistory {
  return { entries: [], index: -1 };
}

/**
 * Records a visit. A repeat of the current page returns the same object, which is
 * how stepping (it lands on the current entry) records nothing. A new page drops
 * the forward entries and, past the cap, the oldest.
 */
export function recordVisit(history: NavHistory, tab: WorkspaceTab): NavHistory {
  if (history.entries[history.index]?.pageId === tab.pageId) return history;
  const kept = [...history.entries.slice(0, history.index + 1), tab];
  const entries = kept.slice(-NAV_HISTORY_CAP);
  return { entries, index: entries.length - 1 };
}

type Exists = (tab: WorkspaceTab) => boolean;

/** True when an existing entry lies one or more steps in `direction`. */
export function canStep(history: NavHistory, direction: -1 | 1, exists: Exists): boolean {
  return history.entries.some((tab, i) => (direction < 0 ? i < history.index : i > history.index) && exists(tab));
}

/**
 * Moves to the nearest existing entry in `direction`. Entries whose page is gone
 * are dropped from the returned history; the tab is null when nowhere is left.
 */
export function stepHistory(
  history: NavHistory,
  direction: -1 | 1,
  exists: Exists,
): { history: NavHistory; tab: WorkspaceTab | null } {
  const entries = history.entries.filter((tab, i) => i === history.index || exists(tab));
  const here = entries.indexOf(history.entries[history.index]);
  const target = here + direction;
  if (target < 0 || target >= entries.length) return { history: { entries, index: here }, tab: null };
  return { history: { entries, index: target }, tab: entries[target] };
}
