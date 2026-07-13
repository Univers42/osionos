/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import type { MediaBlockType } from "@/entities/block";
import {
  filterSlashCommands,
  groupSlashCommands,
  parseSlashQuery,
  PLACEHOLDER_COMMAND_ID,
} from "@/features/slash-commands/model/slashMenuCatalog";
import { usePageStore } from "@/store/usePageStore";
import type {
  SlashCreatePageCommand,
  SlashDatabaseViewCommand,
  SlashBlockCommand,
  SlashCommand,
  SlashInlineCommand,
  SlashMediaPickerCommand,
  SlashTurnIntoCommand,
} from "@/features/slash-commands/model/types";

type SelectableSlashCommand = Exclude<SlashCommand, SlashMediaPickerCommand>;

const MENU_MARGIN = 8;
const MENU_GAP = 6;
const COMMAND_MENU_WIDTH = 264;
const COMMAND_MENU_MAX_HEIGHT = 420;

// The keyboard-active row. `--osio-bg-muted` collides with the panel's
// `--osio-bg-elevated` in the dark palettes (both ~#2A2723), so the highlight was
// invisible there. A fg-derived gray always contrasts the panel in light AND dark,
// and the inset accent bar makes the focused row unmistakable while arrowing.
const ACTIVE_ROW_STYLE: React.CSSProperties = {
  background: "color-mix(in srgb, var(--osio-fg-default) 14%, transparent)",
  boxShadow: "inset 2px 0 0 0 var(--osio-accent)",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface SlashCommandMenuProps {
  pageId?: string;
  position: { x: number; y: number; top: number };
  filter: string;
  onSelect: (
    item: SlashBlockCommand | SlashTurnIntoCommand | SlashCreatePageCommand | SlashInlineCommand | SlashDatabaseViewCommand,
  ) => void;
  onMediaSelect: (kind: MediaBlockType, value: string) => void;
  onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  pageId,
  position,
  filter,
  onSelect,
  onMediaSelect,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prevFilter, setPrevFilter] = useState(filter);

  // The text after "/" splits into a command token + an optional argument
  // ("color" + "gray"). Matching keys off the command only, so a space + arg keeps
  // the list alive instead of emptying it.
  const { command, arg } = parseSlashQuery(filter);

  // `/placeholder` is template-only: hide it unless this editor's page is a template.
  const isTemplatePage = usePageStore((s) => (pageId ? Boolean(s.pageById(pageId)?.isTemplate) : false));
  const filtered = useMemo(
    () => filterSlashCommands(filter).filter((c) => c.id !== PLACEHOLDER_COMMAND_ID || isTemplatePage),
    [filter, isTemplatePage],
  );
  // Typing a query → one flat, relevance-ranked list so the best match sits on top
  // and arrow-to-pick is predictable. No query → the sectioned catalog.
  const sections = useMemo(
    () => (command ? [{ id: "results", label: "", items: filtered }] : groupSlashCommands(filtered)),
    [command, filtered],
  );
  // sections may re-sort vs the flat `filtered` array. Highlight AND selection index
  // against THIS ordered list (the exact render order) or Enter fires a different
  // item than is shown.
  const ordered = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const effectiveActiveIdx = Math.min(activeIdx, Math.max(ordered.length - 1, 0));

  // Reset the highlight to the first command whenever the query changes — during
  // render (React's previous-props pattern), not inside an effect.
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setActiveIdx(0);
  }

  // The caret stays in the block: you type the query inline right after the "/",
  // and the editor pushes it into `filter` (tryHandleSlashMenu). So the panel
  // grabs NO focus of its own — same model as the "[[" page menu — leaving the
  // contenteditable free to keep receiving keystrokes.

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleCommandSelect = useCallback(
    (command: SlashCommand) => {
      if (command.kind === "media-picker") {
        // Notion-style: drop an empty media block; its void row opens the embed
        // dialog on click. No up-front asset picker in the menu.
        onMediaSelect(command.mediaKind, "");
        return;
      }
      onSelect(command as SelectableSlashCommand);
    },
    [onMediaSelect, onSelect],
  );

  // The panel OWNS Arrow/Enter/Escape while open: capture-phase + stopImmediate
  // so the editor's own caret navigation never also fires (that double-handling
  // was why arrows moved the caret instead of navigating the list). Printable
  // keys are left alone so they reach the block — you type the query inline
  // right after the "/", which drives the filter.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const nav = event.key === "ArrowDown" || event.key === "ArrowUp"
        || event.key === "Enter" || event.key === "Escape";
      if (!nav) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowDown") { setActiveIdx((i) => Math.min(i + 1, ordered.length - 1)); return; }
      if (event.key === "ArrowUp") { setActiveIdx((i) => Math.max(i - 1, 0)); return; }
      const command = ordered[effectiveActiveIdx];
      if (command) handleCommandSelect(command);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [effectiveActiveIdx, ordered, handleCommandSelect, onClose]);

  // Keep the active item visible when navigating with the keyboard.
  useEffect(() => {
    const container = ref.current?.querySelector('[role="listbox"]');
    container?.querySelectorAll('[role="option"]')[effectiveActiveIdx]?.scrollIntoView({ block: "nearest" });
  }, [effectiveActiveIdx]);

  // The caret anchor is captured on open; on page scroll/resize it goes stale, so
  // close instead of floating in the wrong place. Scrolling the menu's own list
  // (capture-phase) is ignored.
  useEffect(() => {
    const onScroll = (event: Event) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    };
    globalThis.addEventListener("scroll", onScroll, true);
    globalThis.addEventListener("resize", onClose);
    return () => {
      globalThis.removeEventListener("scroll", onScroll, true);
      globalThis.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const menuStyle = useMemo<React.CSSProperties>(() => {
    const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1024;
    const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 768;
    const left = clamp(position.x, MENU_MARGIN, viewportWidth - COMMAND_MENU_WIDTH - MENU_MARGIN);

    const spaceAbove = position.top - MENU_GAP - MENU_MARGIN;
    const spaceBelow = viewportHeight - position.y - MENU_GAP - MENU_MARGIN;
    // Prefer ABOVE the caret: pin the panel's BOTTOM edge just above the "/" (via
    // `bottom`, so the bottom-left corner sits right on the caret line with NO gap
    // whatever the item count) and grow upward. Flip below only when the caret is
    // too near the top of the viewport to fit a usable panel above it.
    const placeAbove = spaceAbove >= Math.min(COMMAND_MENU_MAX_HEIGHT, 180) || spaceAbove >= spaceBelow;

    return placeAbove
      ? { left, bottom: viewportHeight - (position.top - MENU_GAP), maxHeight: Math.min(COMMAND_MENU_MAX_HEIGHT, spaceAbove) }
      : { left, top: position.y + MENU_GAP, maxHeight: Math.min(COMMAND_MENU_MAX_HEIGHT, spaceBelow) };
  }, [position.x, position.y, position.top]);

  if (typeof document === "undefined") return null;

  let commandIndex = -1;

  // Portal to <body> so `position: fixed` resolves against the viewport (the
  // editor page sets `container-type: size`, which would otherwise make it the
  // containing block and drift the menu off the caret).
  return createPortal(
    <div
      ref={ref}
      data-testid="slash-command-menu"
      className="fixed z-[var(--osio-z-popover)] flex w-[264px] flex-col overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]"
      style={menuStyle}
    >
      {/* Status echo of the command + arg you're typing after the "/" (the caret
          lives in the block, not here). Feedback only — never captures focus, and
          hidden entirely until you type, so there's no input-looking box on open. */}
      {command ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-[var(--osio-border-default)] px-3 py-2"
          aria-hidden="true"
        >
          <Search size={14} className="shrink-0 text-[var(--osio-fg-subtle)]" />
          <span data-testid="slash-command-search" className="min-w-0 flex-1 truncate text-sm">
            <span className="text-[var(--osio-fg-default)]">/{command}</span>
            {arg ? <span className="text-[var(--osio-fg-subtle)]">{` ${arg}`}</span> : null}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--osio-fg-subtle)]">{ordered.length}</span>
        </div>
      ) : null}

      <div id="slash-command-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {ordered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[var(--osio-fg-subtle)]">
            No blocks match “/{command}”.
          </div>
        ) : (
          sections.map((section, sectionIndex) => (
            <React.Fragment key={section.id}>
              {sectionIndex > 0 && <div className="mx-3 my-1 border-t border-[var(--osio-border-default)]" />}
              {section.label ? (
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
                  {section.label}
                </p>
              ) : null}
              {section.items.map((item) => {
                commandIndex += 1;
                const idx = commandIndex;
                const isActive = idx === effectiveActiveIdx;
                return (
                  <button
                    key={item.id}
                    id={`slash-cmd-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-testid="slash-command-entry"
                    data-command-label={item.label}
                    className={`mx-1 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-[120ms] [width:calc(100%-0.5rem)] ${
                      isActive ? "font-medium" : "hover:bg-[var(--osio-bg-hover)]"
                    }`}
                    style={isActive ? ACTIVE_ROW_STYLE : undefined}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleCommandSelect(item)}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-xs text-[var(--osio-fg-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                      {item.icon}
                    </span>
                    <span className="block min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </React.Fragment>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--osio-border-default)] px-3 py-1.5 text-[11px] text-[var(--osio-fg-subtle)]">
        <span>↑↓ navigate</span>
        <span aria-hidden>·</span>
        <span>↵ select</span>
        <span aria-hidden>·</span>
        <span>esc dismiss</span>
      </div>
    </div>,
    document.body,
  );
};
