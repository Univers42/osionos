/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   interactionStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createStore, type StoreApi } from "zustand/vanilla";

import type { SnapGuide } from "../model/snapping";
import type { CanvasFrame } from "../model/types";

// Transient gesture state, separate from the document store: guides and the
// marquee change every frame, and only two tiny leaf components subscribe to
// them — cells never re-render during a drag.

export type CanvasInteractionMode = "move" | "resize" | "marquee" | null;

export interface CanvasInteractionState {
  mode: CanvasInteractionMode;
  guides: SnapGuide[];
  marquee: CanvasFrame | null;
  setMode: (mode: CanvasInteractionMode) => void;
  setGuides: (guides: SnapGuide[]) => void;
  setMarquee: (marquee: CanvasFrame | null) => void;
  reset: () => void;
}

export type CanvasInteractionStore = StoreApi<CanvasInteractionState>;

const NO_GUIDES: SnapGuide[] = [];

export function createInteractionStore(): CanvasInteractionStore {
  return createStore<CanvasInteractionState>((set, get) => ({
    mode: null,
    guides: NO_GUIDES,
    marquee: null,
    setMode: (mode) => set({ mode }),
    setGuides: (guides) => {
      const previous = get().guides;
      if (guides.length === 0 && previous.length === 0) return;
      set({ guides: guides.length === 0 ? NO_GUIDES : guides });
    },
    setMarquee: (marquee) => set({ marquee }),
    reset: () => set({ mode: null, guides: NO_GUIDES, marquee: null }),
  }));
}
