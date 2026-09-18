/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideDockStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** Session-scoped dock terminal state (NOT persisted — server sessions carry
 *  the real continuity). `primary`/`secondary` are bridge session term-ids:
 *  New Terminal switches to a fresh session; Split shows two side-by-side.
 *  Old sessions stay alive server-side until idle-reaped. */
type DockState = {
  primary: string;
  secondary: string | null;
  counter: number;
  newTerminal(): void;
  splitTerminal(): void;
  closeSecondary(): void;
};

export const useIdeDockStore = create<DockState>((set) => ({
  primary: "0",
  secondary: null,
  counter: 1,
  newTerminal: () =>
    set((state) => ({ primary: String(state.counter), secondary: null, counter: state.counter + 1 })),
  splitTerminal: () =>
    set((state) => (state.secondary ? state : { secondary: String(state.counter), counter: state.counter + 1 })),
  closeSecondary: () => set({ secondary: null }),
}));
