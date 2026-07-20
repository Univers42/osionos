/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   terminalRunBus.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/**
 * A one-slot hand-off from the "Run" action to the live sandbox terminal, so a
 * code file runs in the REAL interactive PTY (where `input()`/stdin work) rather
 * than the stateless one-shot runner.
 *
 * `requestRun` parks a command; `useIdeTerminal` drains it — on connect (so
 * opening the terminal then running works) and whenever `seq` advances while
 * already open (running with the terminal already up). One slot is enough: a
 * second Run before the first drained simply replaces it.
 */
interface TerminalRunBus {
  pending: string | null;
  seq: number;
  requestRun: (command: string) => void;
  drain: () => string | null;
}

export const useTerminalRunBus = create<TerminalRunBus>((set, get) => ({
  pending: null,
  seq: 0,
  requestRun: (command) => set((s) => ({ pending: command, seq: s.seq + 1 })),
  drain: () => {
    const cmd = get().pending;
    if (cmd !== null) set({ pending: null });
    return cmd;
  },
}));
