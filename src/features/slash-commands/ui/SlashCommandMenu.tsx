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

import type { MediaBlockType } from "@/entities/block";
import {
  filterSlashCommands,
  groupSlashCommands,
  parseSlashQuery,
  PLACEHOLDER_COMMAND_ID,
  PROFILE_FIELD_COMMAND_ID,
  slashSectionLabel,
} from "@/features/slash-commands/model/slashMenuCatalog";
import { readSlashRecents, recordSlashUse } from "@/features/slash-commands/model/slashRecents";
import { useWholeRowScroll } from "@/shared/lib/dom/useWholeRowScroll";
import { isSlashCommandAvailable } from "@/features/slash-commands/model/slashAvailability";
import { isBuiltInAppReady } from "@/features/whiteboard/model/whiteboardAvailability";
import { isReadmePage } from "@/features/profile-binding/model/readmePage";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";
import { usePageStore } from "@/store/usePageStore";
import type {
  SlashAiCommand,
  SlashAiImageCommand,
  SlashProfileFieldCommand,
  SlashCreatePageCommand,
  SlashDatabaseViewCommand,
  SlashBlockCommand,
  SlashCommand,
  SlashInlineCommand,
  SlashLinkBlockCommand,
  SlashMediaPickerCommand,
  SlashTurnIntoCommand,
  SlashWhiteboardCommand,
  SlashDictateCommand,
} from "@/features/slash-commands/model/types";

type SelectableSlashCommand = Exclude<SlashCommand, SlashMediaPickerCommand>;

const MENU_MARGIN = 8;
const MENU_GAP = 6;
const COMMAND_MENU_WIDTH = 324;
const COMMAND_MENU_MAX_HEIGHT = 448;

const AVAILABILITY = { isAppReady: isBuiltInAppReady };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface SlashCommandMenuProps {
  pageId?: string;
  position: { x: number; y: number; top: number };
  filter: string;
  onSelect: (
    item: SlashBlockCommand | SlashTurnIntoCommand | SlashCreatePageCommand | SlashInlineCommand | SlashDatabaseViewCommand | SlashWhiteboardCommand | SlashProfileFieldCommand | SlashAiCommand | SlashDictateCommand | SlashAiImageCommand | SlashLinkBlockCommand,
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
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prevFilter, setPrevFilter] = useState(filter);

  // The text after "/" splits into a command token + an optional argument
  // ("color" + "gray"). Matching keys off the command only, so a space + arg keeps
  // the list alive instead of emptying it.
  const { command, arg } = parseSlashQuery(filter);

  // `/placeholder` is template-only: hide it unless this editor's page is a template.
  const isTemplatePage = usePageStore((s) => (pageId ? Boolean(s.pageById(pageId)?.isTemplate) : false));
  // `/profile field` is README-only: hide it on every page but the owner's README.
  const isReadme = useAccountProfileStore((s) => isReadmePage(pageId, s.profile));
  const filtered = useMemo(
    () => filterSlashCommands(filter).filter((c) => (c.id !== PLACEHOLDER_COMMAND_ID || isTemplatePage) && (c.id !== PROFILE_FIELD_COMMAND_ID || isReadme) && isSlashCommandAvailable(c, AVAILABILITY)),
    [filter, isTemplatePage, isReadme],
  );
  // Typing a query → one flat, relevance-ranked list so the best match sits on top
  // and arrow-to-pick is predictable. No query → Suggested recents, then the
  // sectioned catalog. Recents are read ONCE on open, never per keystroke.
  const [recents] = useState(readSlashRecents);
  const sections = useMemo(() => {
    if (command) return [{ id: "results", label: "", items: filtered }];
    const byId = new Map(filtered.map((item) => [item.id, item]));
    const suggested = recents
      .map((id) => byId.get(id))
      .filter((item): item is SlashCommand => Boolean(item));
    const base = groupSlashCommands(filtered);
    return suggested.length > 0
      ? [{ id: "suggested", label: slashSectionLabel("suggested"), items: suggested }, ...base]
      : base;
  }, [command, filtered, recents]);
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
      if (command.kind !== "media-picker" && !isSlashCommandAvailable(command, AVAILABILITY)) return;
      // Every pick — click or Enter, typed block or media — passes through here:
      // the one place a "Suggested" recent is recorded.
      recordSlashUse(command.id);
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
    // The panel is 324px wide but never wider than the viewport minus its margin,
    // and at most 40vh tall (448px cap) — the placement maths uses the real size.
    const menuWidth = Math.min(COMMAND_MENU_WIDTH, viewportWidth - MENU_MARGIN * 2);
    const menuHeight = Math.min(COMMAND_MENU_MAX_HEIGHT, viewportHeight * 0.4);
    const left = clamp(position.x, MENU_MARGIN, viewportWidth - menuWidth - MENU_MARGIN);

    const spaceAbove = position.top - MENU_GAP - MENU_MARGIN;
    const spaceBelow = viewportHeight - position.y - MENU_GAP - MENU_MARGIN;
    // Prefer ABOVE the caret: pin the panel's BOTTOM edge just above the "/" (via
    // `bottom`, so the bottom-left corner sits right on the caret line with NO gap
    // whatever the item count) and grow upward. Flip below only when the caret is
    // too near the top of the viewport to fit a usable panel above it.
    const placeAbove = spaceAbove >= Math.min(menuHeight, 180) || spaceAbove >= spaceBelow;

    return placeAbove
      ? { left, bottom: viewportHeight - (position.top - MENU_GAP), maxHeight: Math.min(menuHeight, spaceAbove) }
      : { left, top: position.y + MENU_GAP, maxHeight: Math.min(menuHeight, spaceBelow) };
  }, [position.x, position.y, position.top]);

  useWholeRowScroll(listRef, ordered);

  if (typeof document === "undefined") return null;

  let commandIndex = -1;

  // Portal to <body> so `position: fixed` resolves against the viewport (the
  // editor page sets `container-type: size`, which would otherwise make it the
  // containing block and drift the menu off the caret).
  return createPortal(
    <div
      ref={ref}
      data-testid="slash-command-menu"
      // z-index above the layout canvas's escalated stack (notionPage.css):
      // the cell inspector/settings panels sit at `--osio-z-popover + 20/21`,
      // and `.osionos-layout-grid[data-canvas-active]` rises to `+ 24` so a
      // selected cell's own resize handles clear its own inspector — typing
      // "/" inside that same cell opens this menu at the caret, so it must
      // stay the topmost, clickable layer above ALL of that, never obscured
      // by a passive side panel or by the active grid itself.
      className="osio-surface-overlay osio-slash-menu-in fixed z-[calc(var(--osio-z-popover)+26)] flex w-[324px] min-w-[180px] max-w-[calc(100vw-24px)] flex-col overflow-hidden"
      style={menuStyle}
    >
      <div
        ref={listRef}
        id="slash-command-list"
        role="listbox"
        className="osio-scroll-fade relative min-h-0 flex-1 overflow-y-auto"
        style={{ "--osio-scroll-fade-size": "34px" } as React.CSSProperties}
      >
        {ordered.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-[var(--osio-fg-muted)]">
            No results
          </div>
        ) : (
          sections.map((section, sectionIndex) => (
            <React.Fragment key={section.id}>
              {sectionIndex > 0 && <div className="osio-menu-separator" />}
              {section.label ? (
                <p className="osio-menu-label">
                  {section.label}
                </p>
              ) : null}
              {section.items.map((item) => {
                commandIndex += 1;
                const idx = commandIndex;
                const isActive = idx === effectiveActiveIdx;
                const isSuggested = section.id === "suggested";
                return (
                  <button
                    key={`${section.id}:${item.id}`}
                    id={`slash-cmd-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-testid="slash-command-entry"
                    data-command-label={item.label}
                    className="osio-menu-item"
                    style={{ height: 32 }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleCommandSelect(item)}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base text-[var(--osio-fg-muted)] [&>svg]:h-5 [&>svg]:w-5">
                      {item.icon}
                    </span>
                    <span className="block min-w-0 flex-1 truncate">
                      {item.kind === "whiteboard" && arg ? `Create board “${arg}”` : item.label}
                      {isSuggested ? (
                        <span className="text-[var(--osio-fg-subtle)]">{` · ${slashSectionLabel(item.section)}`}</span>
                      ) : null}
                    </span>
                    {item.shortcut ? (
                      <span className="ml-auto shrink-0 pl-2 text-xs text-[var(--osio-fg-subtle)]">{item.shortcut}</span>
                    ) : null}
                  </button>
                );
              })}
            </React.Fragment>
          ))
        )}
      </div>

      <div className="osio-menu-separator shrink-0" />
      <button
        type="button"
        data-testid="slash-command-close"
        className="osio-menu-item shrink-0"
        style={{ height: 32 }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
      >
        <span className="min-w-0 flex-1 truncate">Close menu</span>
        <span className="ml-auto shrink-0 pl-2 text-xs text-[var(--osio-fg-subtle)]">esc</span>
      </button>
    </div>,
    document.body,
  );
};
