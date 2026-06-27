/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerView.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * How the Explorer (Files) sidebar presents the workspace: the page TREE (default)
 * or the folders GALLERY organization. Switching to "gallery" makes the ONE left
 * sidebar show the folder list (FolderRail) instead of the tree, while the editor
 * area shows the cover-card gallery — no second redundant sidebar. Persisted.
 */

import { create } from "zustand";

export type ExplorerView = "tree" | "gallery";

const STORAGE_KEY = "osionos.explorer.view";

function initialView(): ExplorerView {
  if (globalThis.window === undefined) return "tree";
  return globalThis.localStorage.getItem(STORAGE_KEY) === "gallery" ? "gallery" : "tree";
}

interface ExplorerViewState {
  view: ExplorerView;
  setView: (view: ExplorerView) => void;
}

export const useExplorerView = create<ExplorerViewState>((set) => ({
  view: initialView(),
  setView: (view) => {
    if (globalThis.window !== undefined) globalThis.localStorage.setItem(STORAGE_KEY, view);
    set({ view });
  },
}));
