/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useZenMode.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

interface ZenState {
  zen: boolean;
  toggle: () => void;
  exit: () => void;
}

/**
 * Zen (focus) mode — hides every chrome region so only the current page remains.
 * Toggled by the `Ctrl+K Ctrl+Z` chord (see defaultAutomations).
 *
 * DELIBERATELY NOT PERSISTED. `uiStore` persists its whole shape, so a zen flag
 * living there would survive reload and strand the user in a chrome-less app with
 * no visible way out. Zen is session state: a reload always lands you back in the
 * normal shell.
 *
 * The chrome is hidden with CSS off `[data-zen]` (see global.css) rather than by
 * unmounting, so every region keeps its state and exiting restores it exactly.
 */
export const useZenMode = create<ZenState>((set, get) => ({
  zen: false,
  toggle: () => set({ zen: !get().zen }),
  exit: () => set({ zen: false }),
}));

/**
 * Toggle zen mode, and on entering it toast the way out: zen hides the chrome
 * that holds every other exit. Shared by the Ctrl+K Ctrl+Z chord and View ›
 * Appearance › Zen mode.
 */
export function toggleZenWithExitHint(): void {
  useZenMode.getState().toggle();
  if (!useZenMode.getState().zen) return;
  useToastStore.getState().push({
    kind: "info",
    title: "Zen mode",
    description: "Press Ctrl+K Ctrl+Z to exit",
    action: { label: "Exit", onClick: () => useZenMode.getState().exit() },
  });
}
