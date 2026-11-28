/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TopBarSearch.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The app's one entry point. What the query starts with picks the mode, and
// the icon and the chip follow it: '>' commands, ':' settings, '/' ask the
// assistant, '@' people, '#' messages, '?' the list of modes.

import React, { useEffect, useRef, useState } from "react";
import { AtSign, CircleQuestionMark, Hash, Search, SlidersHorizontal, Sparkles, SquareChevronRight, type LucideIcon } from "lucide-react";
import { cx } from "@osionos/ui/shared/classNames";
import type { PaletteCommand } from "../model/commands";
import { paletteModeLabel, type PaletteMode } from "../model/paletteModes";
import type { PaletteResult } from "../model/search";
import { usePalette } from "../model/usePalette";
import { usePaletteResults, type SettingsTable } from "../model/usePaletteResults";

interface TopBarSearchProps {
  commands: PaletteCommand[];
  settings: SettingsTable;
  /** 44px input for a finger; the desktop bar stays 28px. */
  touch?: boolean;
}

const MODE_ICONS: Record<PaletteMode, LucideIcon> = {
  search: Search,
  command: SquareChevronRight,
  setting: SlidersHorizontal,
  ask: Sparkles,
  people: AtSign,
  messages: Hash,
  help: CircleQuestionMark,
};

const LISTBOX_ID = "osio-topbar-results";
const optionId = (result: PaletteResult) => `osio-topbar-option-${encodeURIComponent(result.id)}`;

/** The rows, or the text shown when there are none. Focus never leaves the input:
 *  a row is reached with the arrows and the input's aria-activedescendant. */
const ResultList: React.FC<{
  results: PaletteResult[];
  active: number;
  hint: string | null;
  status: string;
  onHover: (index: number) => void;
  onChoose: (result: PaletteResult) => void;
}> = ({ results, active, hint, status, onHover, onChoose }) => (
  <ul
    id={LISTBOX_ID}
    role="listbox"
    aria-label="Results"
    // Keeps the caret in the input when a row is clicked, so a row that narrows the bar can be typed after.
    onMouseDown={(event) => event.preventDefault()}
    className="osio-surface-overlay absolute left-0 right-0 top-full z-[var(--osio-z-popover)] mt-1 max-h-80 overflow-y-auto"
  >
    {hint && <li role="presentation" className="px-2 pb-1 pt-1.5 text-xs text-[var(--osio-fg-muted)]">{hint}</li>}
    {results.length === 0 && <li role="presentation" className="px-2 py-2 text-sm text-[var(--osio-fg-subtle)]">{status}</li>}
    {results.map((result, index) => (
      // The option itself is the click target: a button inside an option is a nested
      // control assistive tech cannot reach (#224).
      <li
        key={result.id}
        id={optionId(result)}
        role="option"
        aria-selected={index === active}
        onPointerEnter={() => onHover(index)}
        onClick={() => onChoose(result)}
        className={cx(
          "group flex w-full cursor-pointer items-center gap-2 rounded-[var(--osio-radius-sm)] pr-2",
          index === active ? "bg-[var(--osio-menu-item-hover-bg)]" : "hover:bg-[var(--osio-menu-item-hover-bg)]",
        )}
      >
        <span className="flex h-[var(--osio-control-h-sm)] min-w-0 flex-1 items-center justify-between gap-4 px-2 text-left text-sm text-[var(--osio-fg-default)]">
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="max-w-full shrink-0 truncate">{result.title}</span>
            {result.subtitle && <span className="min-w-0 flex-1 truncate text-xs text-[var(--osio-fg-muted)] group-hover:text-[var(--osio-fg-default)] group-aria-selected:text-[var(--osio-fg-default)]">{result.subtitle}</span>}
          </span>
          {result.accelerator && <span className="shrink-0 font-mono text-xs text-[var(--osio-fg-muted)] group-hover:text-[var(--osio-fg-default)] group-aria-selected:text-[var(--osio-fg-default)]">{result.accelerator}</span>}
        </span>
      </li>
    ))}
  </ul>
);

/** Closes the bar on a pointer press outside it. */
function useCloseOnOutsidePress(open: boolean, containerRef: React.RefObject<HTMLDivElement | null>, setOpen: (open: boolean) => void): void {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Element | null;
      if (containerRef.current?.contains(target as Node)) return;
      // A portaled modal opened FROM a result (ConnectNoteModal renders to
      // document.body) is not outside: closing here would unmount it mid-use.
      if (target?.closest('[role="dialog"]')) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, containerRef, setOpen]);
}

export const TopBarSearch: React.FC<TopBarSearchProps> = ({ commands, settings, touch = false }) => {
  const { open, query, focusSeq, setQuery, setOpen, close } = usePalette();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { mode, results, hint, status } = usePaletteResults(open, query, commands, settings);
  useCloseOnOutsidePress(open, containerRef, setOpen);

  // An open request puts the caret at the end, never selects: after ⌘⇧P the next key
  // types after '>' instead of replacing it.
  useEffect(() => {
    const input = inputRef.current;
    if (focusSeq === 0 || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusSeq]);

  function choose(result: PaletteResult | undefined): void {
    if (!result) return;
    if (result.refine !== undefined) {
      setQuery(result.refine);
      setActive(0);
      inputRef.current?.focus();
      return;
    }
    result.run();
    setQuery("");
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  }

  const showResults = open && query.trim().length > 0;
  const Icon = MODE_ICONS[mode];
  const named = mode !== "search";
  const label = paletteModeLabel(mode);

  return (
    <div ref={containerRef} data-palette-mode={mode} className="relative w-full max-w-xl">
      <Icon
        size={14}
        aria-hidden
        className={cx(
          "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2",
          named ? "text-[var(--osio-accent-text)]" : "text-[var(--osio-fg-subtle)]",
        )}
      />
      <input name="search-pages-or-run"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showResults}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={showResults && results[active] ? optionId(results[active]) : undefined}
        aria-label="Search pages or run a command"
        aria-describedby={named ? "osio-topbar-mode" : undefined}
        placeholder="Search, or type ? for modes"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        className={cx(
          touch ? "h-11 text-base" : "h-7 text-sm",
          "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] pl-8 text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]",
          named ? "pr-24" : "pr-3",
        )}
      />
      {named && (
        <span
          id="osio-topbar-mode"
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] px-1.5 text-xs leading-5 text-[var(--osio-fg-default)]"
        >
          {label}
        </span>
      )}
      {/* Speaks a mode change only: empty while searching, and emptied when the bar closes. */}
      <span className="sr-only" aria-live="polite">{open && named ? `${label} mode` : ""}</span>
      {showResults && (
        <ResultList results={results} active={active} hint={hint} status={status} onHover={setActive} onChoose={choose} />
      )}
    </div>
  );
};
