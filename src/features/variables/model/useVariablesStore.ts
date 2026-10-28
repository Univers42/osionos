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

/** One `env.json`: at the workspace root (`parentPageId` null) or under a page, for its subtree. */
export interface EnvFile {
  pageId: string;
  parentPageId: string | null;
  source: string;
  definitions: ReadonlyMap<string, VariableDefinition>;
  errors: string[];
}

export type EnvFileSource = Pick<EnvFile, "pageId" | "parentPageId" | "source">;

interface VariablesState {
  byWorkspace: Record<string, readonly EnvFile[]>;
  /**
   * Bumped whenever any resolved value may have changed (env files, page titles and
   * properties, preferences, the minute clock). Editors put it in their render-cache
   * key; only blocks whose text holds `{{` subscribe to it, so plain blocks never re-render.
   */
  version: number;
  setFiles: (workspaceId: string, files: readonly EnvFileSource[]) => void;
  bump: () => void;
}

const sameFile = (a: EnvFile, b: EnvFileSource) =>
  a.pageId === b.pageId && a.parentPageId === b.parentPageId && a.source === b.source;

export const useVariablesStore = create<VariablesState>()((set, get) => ({
  byWorkspace: {},
  version: 0,
  setFiles: (workspaceId, files) => {
    const current = get().byWorkspace[workspaceId] ?? [];
    if (current.length === files.length && files.every((file, i) => sameFile(current[i], file))) return;
    // Only a changed source is parsed again; unchanged files keep their definitions.
    const next = files.map((file) => {
      const kept = current.find((c) => c.pageId === file.pageId && c.source === file.source);
      return kept && kept.parentPageId === file.parentPageId ? kept : { ...file, ...parseVariableDefinitions(file.source) };
    });
    set((s) => ({ byWorkspace: { ...s.byWorkspace, [workspaceId]: next }, version: s.version + 1 }));
  },
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
