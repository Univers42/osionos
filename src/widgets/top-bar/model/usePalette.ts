/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePalette.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import { create } from "zustand";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

interface PaletteState {
  open: boolean;
  query: string;
  /** Bumped on every open request so the search input can re-focus itself. */
  focusSeq: number;
  setQuery: (query: string) => void;
  setOpen: (open: boolean) => void;
  openSearch: () => void;
  openCommand: () => void;
  close: () => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  query: "",
  focusSeq: 0,
  setQuery: (query) => set({ query }),
  setOpen: (open) => set({ open }),
  openSearch: () => set((state) => ({ open: true, query: "", focusSeq: state.focusSeq + 1 })),
  openCommand: () => set((state) => ({ open: true, query: ">", focusSeq: state.focusSeq + 1 })),
  close: () => set({ open: false }),
}));

/** Command mode is active when the query starts with '>'. */
export function isCommandMode(query: string): boolean {
  return query.startsWith(">");
}

/**
 * Global top-bar chords, mounted once by TopBar: ⌘K search, ⌘⇧P command,
 * ⌘\ split-right. None collide with the inline editor (which owns ⌘B/I/U/E,
 * ⌘⇧L link, ⌘⇧X strike) or with command mode's '>' (detected only inside the
 * top-bar input, never document-wide).
 */
export function useTopBarHotkeys(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        usePalette.getState().openSearch();
      } else if (key === "p" && event.shiftKey) {
        event.preventDefault();
        usePalette.getState().openCommand();
      } else if (key === "\\") {
        event.preventDefault();
        const layout = useWorkspaceLayout.getState();
        layout.splitActivePane(layout.activePaneId, "row");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
