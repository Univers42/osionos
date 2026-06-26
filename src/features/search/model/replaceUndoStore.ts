/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   replaceUndoStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";

interface UndoState {
  /** pageId -> the page's block content BEFORE the last replace-all batch. */
  snapshots: Record<string, Block[]>;
  label: string;
  capture: (snapshots: Record<string, Block[]>, label: string) => void;
  clear: () => void;
  undo: () => void;
}

/** Single-level, cross-page undo for the last replace-all (the per-editor
 *  history can't span pages). Restores each page's prior content via the store. */
export const useReplaceUndoStore = create<UndoState>((set, get) => ({
  snapshots: {},
  label: "",
  capture: (snapshots, label) => set({ snapshots, label }),
  clear: () => set({ snapshots: {}, label: "" }),
  undo: () => {
    const { snapshots } = get();
    for (const [pageId, content] of Object.entries(snapshots)) {
      usePageStore.getState().updatePageContent(pageId, content);
    }
    set({ snapshots: {}, label: "" });
  },
}));
