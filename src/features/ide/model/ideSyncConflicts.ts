/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideSyncConflicts.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** One surfaced divergence: the sandbox's version of a file whose page ALSO
 *  changed since the last agreement. The page keeps the LOCAL content until a
 *  human picks a side (never silent last-writer-wins — ADR-001 §7). */
export type IdeSyncConflict = {
  relPath: string;
  pageId: string;
  /** The sandbox side's content, held for the "take sandbox" resolution. */
  theirs: string;
  theirsHash: string;
  atMs: number;
};

type ConflictState = {
  byPageId: Record<string, IdeSyncConflict>;
  report(conflict: IdeSyncConflict): void;
  resolve(pageId: string): void;
  clearWorkspace(): void;
};

export const useIdeSyncConflicts = create<ConflictState>((set) => ({
  byPageId: {},
  report: (conflict) =>
    set((state) => ({ byPageId: { ...state.byPageId, [conflict.pageId]: conflict } })),
  resolve: (pageId) =>
    set((state) => {
      const next = { ...state.byPageId };
      delete next[pageId];
      return { byPageId: next };
    }),
  clearWorkspace: () => set({ byPageId: {} }),
}));

export function conflictCount(byPageId: Record<string, IdeSyncConflict>): number {
  return Object.keys(byPageId).length;
}
