/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDevMode.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DevModeState {
  /** IDE / developer view: show file extensions + IDE affordances (new code file,
   *  run terminal) and JetBrains chrome on code panes. */
  dev: boolean;
  toggle: () => void;
  set: (value: boolean) => void;
}

/**
 * Developer Mode — the user-facing "mode developer" toggle for the IDE surface.
 *
 * Distinct from the `osio.ide` FLAG: the flag decides whether the IDE feature
 * exists at all (default OFF, additive); this store is the runtime switch a user
 * flips to *enter* IDE mode. Both must be true for IDE UX to show.
 *
 * SAFE to persist (unlike Zen mode): it never hides the way out — it only reveals
 * extra affordances and file extensions. Persisting means "I'm a developer" sticks
 * across reloads, which is the desired behavior.
 */
export const useDevMode = create<DevModeState>()(
  persist(
    (set, get) => ({
      dev: false,
      toggle: () => set({ dev: !get().dev }),
      set: (value: boolean) => set({ dev: value }),
    }),
    { name: "osio.devmode" },
  ),
);
