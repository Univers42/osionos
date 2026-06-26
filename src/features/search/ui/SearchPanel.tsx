/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SearchPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useState } from "react";
import { CaseSensitive, Regex, Replace, Settings2, WholeWord } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useSearchStore } from "../model/useSearchStore";
import { searchWorkspace } from "../model/searchEngine";
import { replaceAll } from "../model/replaceEngine";
import { useReplaceUndoStore } from "../model/replaceUndoStore";
import { buildMatcher } from "../lib/matcher";
import type { BlockMatch, PageGroup, SearchOptions } from "../model/resultModel";
import { SearchResults } from "./SearchResults";

const FlagButton: React.FC<{ active: boolean; title: string; onClick: () => void; children: React.ReactNode }> = ({
  active, title, onClick, children,
}) => (
  <button
    type="button"
    aria-pressed={active}
    title={title}
    onClick={onClick}
    className={cx(
      "grid h-6 w-6 place-items-center rounded transition-colors",
      active
        ? "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent)]"
        : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
    )}
  >
    {children}
  </button>
);

const inputClass =
  "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]";

export const SearchPanel: React.FC = () => {
  const s = useSearchStore();
  const hasUndo = useReplaceUndoStore((u) => Object.keys(u.snapshots).length > 0);
  const undo = useReplaceUndoStore((u) => u.undo);
  const [confirm, setConfirm] = useState<{ pages: number; matches: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const st = useSearchStore.getState();
    const built = buildMatcher(st.query, st);
    if (!built.ok) {
      st.patch({ results: [], status: built.error ? "error" : "idle", error: built.error });
      return;
    }
    const generation = st.nextGeneration();
    st.patch({ status: "searching", error: "" });
    const opts: SearchOptions = {
      caseSensitive: st.caseSensitive, wholeWord: st.wholeWord, regex: st.regex,
      includeGlob: st.includeGlob, excludeGlob: st.excludeGlob, openEditorsOnly: st.openEditorsOnly,
    };
    const groups = await searchWorkspace(st.query, opts, () => useSearchStore.getState().generation !== generation);
    if (useSearchStore.getState().generation !== generation) return;
    useSearchStore.getState().patch({ results: groups, status: "done" });
  }, []);

  useEffect(() => {
    const timer = setTimeout(runSearch, 250);
    return () => clearTimeout(timer);
  }, [s.query, s.caseSensitive, s.wholeWord, s.regex, s.includeGlob, s.excludeGlob, s.openEditorsOnly, runSearch]);

  const openMatch = useCallback((group: PageGroup, match: BlockMatch) => {
    const page = usePageStore.getState().pageById(group.pageId);
    if (page) useWorkspaceLayout.getState().openTab(pageEntryToTab(page));
    if (match.blockId) {
      setTimeout(() => {
        document.querySelector(`[data-block-id="${match.blockId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 200);
    }
  }, []);

  const editableGroups = s.results.filter((g) => g.editable && !g.archived);
  const totalMatches = s.results.reduce((n, g) => n + g.matchCount, 0);

  const doReplace = async () => {
    setConfirm(null);
    const st = useSearchStore.getState();
    const opts: SearchOptions = {
      caseSensitive: st.caseSensitive, wholeWord: st.wholeWord, regex: st.regex,
      includeGlob: st.includeGlob, excludeGlob: st.excludeGlob, openEditorsOnly: st.openEditorsOnly,
    };
    const res = await replaceAll(st.query, st.replaceText, st.preserveCase, opts, st.results);
    setSummary(`Replaced ${res.matches} in ${res.pages} page(s)${res.skipped ? `, ${res.skipped} skipped` : ""}.`);
    runSearch();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="space-y-1.5 px-2 pt-2">
        <div className="relative">
          <input
            value={s.query}
            onChange={(e) => s.patch({ query: e.target.value })}
            placeholder="Search"
            aria-label="Search query"
            className={cx(inputClass, "pr-20", s.status === "error" && "border-[var(--osio-danger)]")}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <FlagButton active={s.caseSensitive} title="Match case" onClick={() => s.patch({ caseSensitive: !s.caseSensitive })}><CaseSensitive size={14} /></FlagButton>
            <FlagButton active={s.wholeWord} title="Match whole word" onClick={() => s.patch({ wholeWord: !s.wholeWord })}><WholeWord size={14} /></FlagButton>
            <FlagButton active={s.regex} title="Use regular expression" onClick={() => s.patch({ regex: !s.regex })}><Regex size={14} /></FlagButton>
          </div>
        </div>

        <div className="relative">
          <input
            value={s.replaceText}
            onChange={(e) => s.patch({ replaceText: e.target.value })}
            placeholder="Replace"
            aria-label="Replace text"
            className={cx(inputClass, "pr-16")}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <FlagButton active={s.preserveCase} title="Preserve case" onClick={() => s.patch({ preserveCase: !s.preserveCase })}>
              <span className="text-[10px] font-bold">AB</span>
            </FlagButton>
            <FlagButton
              active={false}
              title="Replace all matches"
              onClick={() => editableGroups.length > 0 && setConfirm({ pages: editableGroups.length, matches: editableGroups.reduce((n, g) => n + g.matchCount, 0) })}
            >
              <Replace size={14} />
            </FlagButton>
          </div>
        </div>

        <button type="button" onClick={() => s.patch({ showOptions: !s.showOptions })} className="flex items-center gap-1 px-1 text-xs text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]">
          <Settings2 size={12} /> {s.showOptions ? "Hide" : "More"} options
        </button>
        {s.showOptions ? (
          <div className="space-y-1.5 pb-1">
            <input value={s.includeGlob} onChange={(e) => s.patch({ includeGlob: e.target.value })} placeholder="files to include (e.g. *report*)" aria-label="Files to include" className={inputClass} />
            <input value={s.excludeGlob} onChange={(e) => s.patch({ excludeGlob: e.target.value })} placeholder="files to exclude" aria-label="Files to exclude" className={inputClass} />
            <label className="flex items-center gap-2 px-1 text-xs text-[var(--osio-fg-muted)]">
              <input type="checkbox" checked={s.openEditorsOnly} onChange={(e) => s.patch({ openEditorsOnly: e.target.checked })} />
              Search only in open editors
            </label>
          </div>
        ) : null}
      </div>

      <div className="px-3 py-1 text-[11px] text-[var(--osio-fg-subtle)]">
        {s.status === "error" && s.error ? <span className="text-[var(--osio-danger)]">{s.error}</span>
          : s.status === "searching" ? "Searching…"
          : s.query ? `${totalMatches} result(s) in ${s.results.length} page(s)`
          : "Type to search the workspace."}
      </div>

      {summary ? (
        <div className="mx-2 mb-1 flex items-center justify-between rounded-md bg-[var(--osio-bg-muted)] px-2 py-1 text-[11px] text-[var(--osio-fg-default)]">
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          {hasUndo ? (
            <button type="button" onClick={() => { undo(); setSummary(null); runSearch(); }} className="ml-2 shrink-0 font-medium text-[var(--osio-accent)] hover:underline">Undo</button>
          ) : null}
        </div>
      ) : null}

      <SearchResults results={s.results} onOpen={openMatch} />

      {confirm ? (
        <div className="absolute inset-0 z-[var(--osio-z-modal)] flex items-center justify-center bg-[var(--osio-overlay)] p-4">
          <div className="w-full max-w-xs rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 shadow-xl">
            <p className="text-sm font-medium text-[var(--osio-fg-default)]">Replace all?</p>
            <p className="mt-1 text-xs text-[var(--osio-fg-muted)]">
              Replace {confirm.matches} occurrence(s) across {confirm.pages} page(s). This writes to the workspace and can be undone once.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-md px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">Cancel</button>
              <button type="button" onClick={doReplace} className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90">Replace all</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
