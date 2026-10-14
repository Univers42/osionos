/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   debugStore.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

// What the debug panel renders: where the run is, where it is stopped, and what it
// printed. Every string that reaches here came from the sandbox's debug adapter, so
// each one is stored as-is and only ever rendered as text.

export type DebugStatus = "idle" | "starting" | "running" | "stopped" | "ended";

export interface DebugFrame {
  id: number;
  name: string;
  /** Workspace-relative path, or null for anything outside the workspace (stdlib). */
  path: string | null;
  line: number;
}

export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
}

/** Ponytail: keeps the newest 500 lines and drops the oldest, so a program that prints
 *  more than that loses its start — including the traceback of a first failed run. Each
 *  append copies that cap, so the store costs O(500) per line however long the run gets.
 *  A line the adapter splits across two `output` events shows as two lines. */
const MAX_OUTPUT_LINES = 500;

// A breakpoint map is keyed by file path from the workspace tree, which is untrusted
// text: these three keys would reach Object.prototype instead of the map.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

interface DebugState {
  status: DebugStatus;
  breakpoints: Record<string, number[]>;
  frames: DebugFrame[];
  variables: DebugVariable[];
  output: string[];
  stoppedReason?: string;
  error?: string;
  toggleBreakpoint(path: string, line: number): void;
  setStatus(status: DebugStatus): void;
  setStoppedReason(reason: string | undefined): void;
  setFrames(frames: DebugFrame[]): void;
  setVariables(variables: DebugVariable[]): void;
  appendOutput(text: string): void;
  setError(error: string | undefined): void;
  reset(): void;
}

const IDLE = {
  status: "idle" as DebugStatus,
  frames: [] as DebugFrame[],
  variables: [] as DebugVariable[],
  output: [] as string[],
  stoppedReason: undefined,
  error: undefined,
};

export const useDebugStore = create<DebugState>((set) => ({
  ...IDLE,
  breakpoints: {},
  // O(k log k) in that file's lines, plus one O(files with breakpoints) map copy.
  toggleBreakpoint: (path, line) => {
    if (FORBIDDEN_KEYS.has(path) || !Number.isInteger(line) || line < 1) return;
    set((state) => {
      // Own keys only: an inherited name such as "toString" would read a function, not lines.
      const current = Object.hasOwn(state.breakpoints, path) ? state.breakpoints[path] : [];
      const lines = current.includes(line) ? current.filter((l) => l !== line) : [...current, line].sort((a, b) => a - b);
      const next = { ...state.breakpoints };
      if (lines.length === 0) delete next[path];
      else next[path] = lines;
      return { breakpoints: next };
    });
  },
  setStatus: (status) => set({ status }),
  setStoppedReason: (stoppedReason) => set({ stoppedReason }),
  setFrames: (frames) => set({ frames }),
  setVariables: (variables) => set({ variables }),
  // One adapter `output` event can carry several lines; the cap counts lines, not events.
  appendOutput: (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    if (lines.length > 0) set((state) => ({ output: [...state.output, ...lines].slice(-MAX_OUTPUT_LINES) }));
  },
  setError: (error) => set({ error }),
  /** Back to `idle` with no session state. Breakpoints stay: they are the user's. */
  reset: () => set((state) => ({ ...IDLE, breakpoints: state.breakpoints })),
}));