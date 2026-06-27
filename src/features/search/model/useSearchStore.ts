/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSearchStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import type { PageGroup, SearchOptions } from "./resultModel";

export type SearchStatus = "idle" | "searching" | "done" | "error";

interface SearchState extends SearchOptions {
  query: string;
  replaceText: string;
  preserveCase: boolean;
  showOptions: boolean;
  results: PageGroup[];
  status: SearchStatus;
  error: string;
  /** Monotonic token so a slow in-flight search can detect it is stale. */
  generation: number;
  patch: (next: Partial<SearchState>) => void;
  nextGeneration: () => number;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  replaceText: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  preserveCase: false,
  includeGlob: "",
  excludeGlob: "",
  openEditorsOnly: false,
  showOptions: false,
  results: [],
  status: "idle",
  error: "",
  generation: 0,
  patch: (next) => set(next),
  nextGeneration: () => {
    const generation = get().generation + 1;
    set({ generation });
    return generation;
  },
}));
