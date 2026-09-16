/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagnosticsStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** LSP DiagnosticSeverity: 1=Error 2=Warning 3=Information 4=Hint. */
export interface IdeDiagnostic {
  uri: string;
  severity: number;
  message: string;
  line: number; // 0-based (LSP)
  character: number;
  source?: string;
}

interface DiagnosticsState {
  byUri: Record<string, IdeDiagnostic[]>;
  /** Replace the diagnostics for one document (a publishDiagnostics push). */
  setForUri: (uri: string, diagnostics: IdeDiagnostic[]) => void;
  clearAll: () => void;
}

/** Diagnostics surfaced by the LSP client (P5), keyed by document URI. Fed from
 *  the lspClient publishDiagnostics tap; read by the Problems panel. */
export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  byUri: {},
  setForUri: (uri, diagnostics) =>
    set((state) => {
      if (diagnostics.length === 0) {
        if (!state.byUri[uri]) return state;
        const next = { ...state.byUri };
        delete next[uri];
        return { byUri: next };
      }
      return { byUri: { ...state.byUri, [uri]: diagnostics } };
    }),
  clearAll: () => set({ byUri: {} }),
}));
