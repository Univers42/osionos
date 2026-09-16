/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideOutputBus.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** The dock's OUTPUT feed: infrastructure logs (fs-sync, terminal lifecycle,
 *  runner, conflicts) that previously vanished into the devtools console. */
export type IdeOutputChannel = "fs-sync" | "terminal" | "runner" | "sync" | "lsp";
export type IdeOutputLine = { channel: IdeOutputChannel; text: string; atMs: number };

const MAX_LINES = 2000;

type OutputState = {
  lines: IdeOutputLine[];
  append(channel: IdeOutputChannel, text: string): void;
  clear(): void;
};

export const useIdeOutputBus = create<OutputState>((set) => ({
  lines: [],
  append: (channel, text) =>
    set((state) => ({ lines: [...state.lines.slice(-(MAX_LINES - 1)), { channel, text, atMs: Date.now() }] })),
  clear: () => set({ lines: [] }),
}));

/** Imperative shorthand for non-React call sites (hooks, engines). */
export function ideOutput(channel: IdeOutputChannel, text: string): void {
  useIdeOutputBus.getState().append(channel, text);
}
