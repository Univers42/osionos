/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TopBarSearch.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import type { PaletteCommand } from "../model/commands";
import { matchCommands, searchPages, searchPagesRemote, type PaletteResult } from "../model/search";
import { isCommandMode, usePalette } from "../model/usePalette";

interface TopBarSearchProps {
  commands: PaletteCommand[];
}

/** The center command/search bar: page search by default, '>' switches to commands. */
export const TopBarSearch: React.FC<TopBarSearchProps> = ({ commands }) => {
  const { open, query, focusSeq, setQuery, setOpen, close } = usePalette();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const command = isCommandMode(query);
  // Instant in-memory results (loaded pages) shown immediately; the bridge then
  // returns the authoritative full-workspace matches (incl. nested notes).
  const instant = useMemo<PaletteResult[]>(
    () => (command ? matchCommands(query.slice(1), commands) : searchPages(query)),
    [command, query, commands],
  );
  const [remote, setRemote] = useState<{ q: string; rows: PaletteResult[] }>({ q: "", rows: [] });
  const results = !command && remote.q === query && remote.rows.length ? remote.rows : instant;

  useEffect(() => {
    if (command || !query.trim()) return;
    const target = query;
    const timer = setTimeout(() => {
      searchPagesRemote(target).then((rows) => setRemote({ q: target, rows })).catch(() => undefined);
    }, 180);
    return () => clearTimeout(timer);
  }, [command, query]);

  useEffect(() => {
    if (focusSeq === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  function activate(result: PaletteResult | undefined): void {
    if (!result) return;
    result.run();
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); activate(results[active]); }
    else if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  }

  const searching = !command && query.trim().length > 0 && remote.q !== query;
  const showResults = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--osio-fg-subtle)]" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="osio-topbar-results"
        aria-label="Search pages or run a command"
        placeholder="Search pages  —  type  >  for commands"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        className="h-7 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] pl-8 pr-3 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      />
      {showResults && (
        <ul
          id="osio-topbar-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-[var(--osio-z-popover)] mt-1 max-h-80 overflow-y-auto rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] py-1 shadow-[var(--osio-shadow-menu)]"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-[var(--osio-fg-subtle)]">
              {searching ? "Searching…" : `No ${command ? "commands" : "pages"} found`}
            </li>
          )}
          {results.map((result, index) => (
            <li key={result.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onPointerEnter={() => setActive(index)}
                onClick={() => activate(result)}
                className={cx(
                  "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm text-[var(--osio-fg-default)]",
                  index === active ? "bg-[var(--osio-bg-hover)]" : "hover:bg-[var(--osio-bg-hover)]",
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{result.title}</span>
                  {result.subtitle && <span className="shrink-0 text-xs text-[var(--osio-fg-subtle)]">{result.subtitle}</span>}
                </span>
                {result.accelerator && <span className="shrink-0 font-mono text-xs text-[var(--osio-fg-subtle)]">{result.accelerator}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
