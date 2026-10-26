/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   webToggle.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The web toggle of the composer: ONE message's choice, never a setting.
 *
 * `take` is what a send reads: it returns the toggle and puts it back to off,
 * so the next message starts without the web whatever the last one did.
 */

import { create } from "zustand";

interface WebToggleState {
  pressed: boolean;
  set: (pressed: boolean) => void;
  take: () => boolean;
}

export const useWebToggle = create<WebToggleState>((set, get) => ({
  pressed: false,
  set: (pressed) => set({ pressed }),
  take: () => {
    const { pressed } = get();
    if (pressed) set({ pressed: false });
    return pressed;
  },
}));
