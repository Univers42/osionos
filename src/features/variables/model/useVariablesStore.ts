/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVariablesStore.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import { parseVariableDefinitions, type VariableDefinition } from "./variableDefinitions";

export interface WorkspaceVariables {
  pageId: string;
  source: string;
  definitions: ReadonlyMap<string, VariableDefinition>;
  errors: string[];
}

interface VariablesState {
  byWorkspace: Record<string, WorkspaceVariables>;
  /**
   * Bumped whenever any resolved value may have changed (definitions, preferences, the
   * minute clock). Editors put it in their render-cache key; only blocks whose text
   * holds `{{` subscribe to it, so plain blocks never re-render.
   */
  version: number;
  setSource: (workspaceId: string, pageId: string, source: string) => void;
  forget: (workspaceId: string) => void;
  bump: () => void;
}

export const useVariablesStore = create<VariablesState>()((set, get) => ({
  byWorkspace: {},
  version: 0,
  setSource: (workspaceId, pageId, source) => {
    const current = get().byWorkspace[workspaceId];
    if (current && current.source === source && current.pageId === pageId) return;
    const parsed = parseVariableDefinitions(source);
    set((s) => ({ byWorkspace: { ...s.byWorkspace, [workspaceId]: { pageId, source, ...parsed } }, version: s.version + 1 }));
  },
  forget: (workspaceId) => {
    if (!get().byWorkspace[workspaceId]) return;
    set((s) => {
      const byWorkspace = { ...s.byWorkspace };
      delete byWorkspace[workspaceId];
      return { byWorkspace, version: s.version + 1 };
    });
  },
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
