/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePaletteResults.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The rows the top bar shows for its query. The mode decides what may reach
// the network: a plain search asks for pages, people and messages; '@' only
// people; '#' only messages; every other mode stays local, so a question typed
// after '/' never leaves the browser until the assistant sends it.

import { useEffect, useMemo, useState } from "react";
import { useUserStore } from "@/features/auth";
import { openAssistantWith } from "@/features/chat/model/openAssistantWith";
import { isUnifiedSearchEnabled } from "@/shared/config/featureFlags";
import { usePageStore } from "@/store/usePageStore";
import { openAssistant } from "./agentMenu";
import type { PaletteCommand } from "./commands";
import { askRows, helpRows, paletteModeHint, parsePaletteQuery, type PaletteMode, type PaletteScope } from "./paletteModes";
import { matchCommands, searchMessagesPalette, searchPages, searchPagesRemote, withoutArchived, type PaletteResult } from "./search";
import { searchPeoplePalette } from "./searchPeople";
import { matchSettings, type InlineSetting } from "./settingRows";

/** The ':' table, or why it is not here yet. */
export type SettingsTable = InlineSetting[] | "loading" | "failed";

interface Fetched {
  query: string;
  rows: PaletteResult[];
}

const NONE: Fetched = { query: "", rows: [] };
const DEBOUNCE_MS = 180;
const ASK_ACTIONS = { open: openAssistant, ask: (text: string) => openAssistantWith({ text }) };

const NOTHING_FOUND: Record<PaletteMode, string> = {
  search: "No pages found",
  command: "No commands found",
  setting: "No settings match",
  ask: "",
  help: "Nothing matches",
  people: "No people found",
  messages: "No messages found",
};

export interface PaletteView {
  mode: PaletteMode;
  results: PaletteResult[];
  /** Shown above the rows while nothing is typed after the prefix. */
  hint: string | null;
  /** Shown instead of rows when there are none. */
  status: string;
}

/** Remote page rows minus the pages archived since they were fetched. */
function useLivePages(rows: PaletteResult[]): PaletteResult[] {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  // archivePage bumps the revision, which re-runs the filter below.
  const revision = usePageStore((state) => (workspaceId ? state.pageRevisions[workspaceId] ?? 0 : 0));
  return useMemo(() => {
    void revision;
    return withoutArchived(rows, (id) => usePageStore.getState().pageById(id)?.archivedAt != null);
  }, [rows, revision]);
}

/** The network rows for `query`, fetched only in the modes allowed to reach the network. */
function useRemoteRows(open: boolean, query: string, mode: PaletteMode, term: string) {
  const [pages, setPages] = useState<Fetched>(NONE);
  const [people, setPeople] = useState<Fetched>(NONE);
  const [messages, setMessages] = useState<Fetched>(NONE);
  useEffect(() => {
    if (!open || !term.trim()) return;
    const timer = setTimeout(() => {
      const keep = (set: (value: Fetched) => void) => (rows: PaletteResult[]) => set({ query, rows });
      if (mode === "search") searchPagesRemote(term).then(keep(setPages)).catch(() => undefined);
      if (mode === "search" || mode === "people") searchPeoplePalette(term).then(keep(setPeople)).catch(() => undefined);
      if (mode === "messages" || (mode === "search" && isUnifiedSearchEnabled())) {
        searchMessagesPalette(term).then(keep(setMessages)).catch(() => undefined);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, mode, term]);
  return { pages, people, messages };
}

interface ModeRows {
  rows: PaletteResult[];
  /** A network answer for this query is still on its way. */
  waiting?: boolean;
  status?: string;
}

interface ModeInput {
  term: string;
  commands: PaletteCommand[];
  settings: SettingsTable;
  scope: PaletteScope;
  /** This query's network rows; null until they arrive. */
  pages: PaletteResult[] | null;
  people: PaletteResult[] | null;
  messages: PaletteResult[] | null;
  instantPages: PaletteResult[];
}

function settingRows(term: string, settings: SettingsTable): ModeRows {
  if (settings === "loading") return { rows: [], status: "Loading settings…" };
  if (settings === "failed") return { rows: [], status: "Settings could not load. Reload the page to try again." };
  return { rows: matchSettings(term, settings) };
}

function modeRows(mode: PaletteMode, input: ModeInput): ModeRows {
  const { term, commands, scope } = input;
  switch (mode) {
    case "search": {
      const pages = input.pages && input.pages.length > 0 ? input.pages : input.instantPages;
      return { rows: [...pages, ...(input.people ?? []), ...(input.messages ?? [])], waiting: input.pages === null };
    }
    case "command": return { rows: matchCommands(term, commands) };
    case "setting": return settingRows(term, input.settings);
    case "ask": return { rows: askRows(term, ASK_ACTIONS) };
    case "help": return { rows: helpRows(term, commands, scope) };
    case "people": return { rows: input.people ?? [], waiting: input.people === null };
    case "messages": return { rows: input.messages ?? [], waiting: input.messages === null };
  }
}

/** What the bar lists for `query`: the mode it selects, its rows, and the text shown when there are none. */
export function usePaletteResults(open: boolean, query: string, commands: PaletteCommand[], settings: SettingsTable): PaletteView {
  const scope = { messages: isUnifiedSearchEnabled() };
  const { mode, term } = parsePaletteQuery(query, scope);
  const remote = useRemoteRows(open, query, mode, term);
  const arrived = (fetched: Fetched) => (fetched.query === query ? fetched.rows : null);
  const livePages = useLivePages(remote.pages.rows);
  const instantPages = mode === "search" ? searchPages(term) : [];
  const { rows, waiting, status } = modeRows(mode, {
    term, commands, settings, scope, instantPages,
    pages: remote.pages.query === query ? livePages : null,
    people: arrived(remote.people),
    messages: arrived(remote.messages),
  });
  const typed = term.trim().length > 0;
  return {
    mode,
    results: rows,
    hint: typed || mode === "search" ? null : paletteModeHint(mode),
    status: status ?? (waiting && typed ? "Searching…" : NOTHING_FOUND[mode]),
  };
}
