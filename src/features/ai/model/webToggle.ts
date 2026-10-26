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
 * `takeAll` is what a send reads: it returns the toggles and puts them back to
 * off, so the next message starts without the web whatever the last one did.
 * Research needs the web: pressing it presses Web, and releasing Web releases it.
 */

import { create } from "zustand";

interface WebToggleState {
  pressed: boolean;
  research: boolean;
  set: (pressed: boolean) => void;
  setResearch: (research: boolean) => void;
  take: () => boolean;
  takeAll: () => { web: boolean; research: boolean };
}

export const useWebToggle = create<WebToggleState>((set, get) => ({
  pressed: false,
  research: false,
  set: (pressed) => set(pressed ? { pressed } : { pressed, research: false }),
  setResearch: (research) => set(research ? { research, pressed: true } : { research }),
  take: () => get().takeAll().web,
  takeAll: () => {
    const { pressed, research } = get();
    if (pressed || research) set({ pressed: false, research: false });
    return { web: pressed, research };
  },
}));
