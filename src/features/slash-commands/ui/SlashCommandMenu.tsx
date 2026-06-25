/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 20:57:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { MediaBlockType } from "@/entities/block";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import {
  filterSlashCommands,
  groupSlashCommands,
} from "@/features/slash-commands/model/slashMenuCatalog";
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
const COMMAND_MENU_WIDTH = 256;
const MEDIA_MENU_WIDTH = 296;
const COMMAND_MENU_MAX_HEIGHT = 416;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface SlashCommandMenuProps {
  position: { x: number; y: number; top: number };
  filter: string;
  onSelect: (
    item: SlashBlockCommand | SlashTurnIntoCommand | SlashCreatePageCommand | SlashInlineCommand | SlashDatabaseViewCommand,
  ) => void;
  onMediaSelect: (kind: MediaBlockType, value: string) => void;
  onClose: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  position,
  filter,
  onSelect,
  onMediaSelect,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeMediaKind, setActiveMediaKind] = useState<MediaBlockType | null>(
    null,
  );

  const filtered = useMemo(() => filterSlashCommands(filter), [filter]);
  const sections = useMemo(() => groupSlashCommands(filtered), [filtered]);

  const effectiveActiveIdx = Math.min(
    activeIdx,
    Math.max(filtered.length - 1, 0),
  );

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleCommandSelect = useCallback(
    (command: SlashCommand) => {
      if (command.kind === "media-picker") {
        setActiveMediaKind(command.mediaKind);
        return;
      }

      onSelect(command as SelectableSlashCommand);
    },
    [onSelect],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIdx((index) => Math.min(index + 1, filtered.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIdx((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const command = filtered[effectiveActiveIdx];
        if (command) {
          handleCommandSelect(command);
        }
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [effectiveActiveIdx, filtered, handleCommandSelect, onClose]);

  // Auto-scroll active item into view when navigating with keyboard
  useEffect(() => {
    const container = ref.current?.querySelector(".overflow-y-auto");
    if (!container) return;
    const activeEl = container.querySelectorAll("button")[effectiveActiveIdx];
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [effectiveActiveIdx]);

  // The caret anchor is captured when the menu opens; on page scroll/resize it
  // goes stale, so close instead of floating in the wrong place (Notion does the
  // same). Scrolling inside the menu's own list (capture-phase) is ignored.
  useEffect(() => {
    const onScroll = (event: Event) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) {
        return;
      }
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
    const width = COMMAND_MENU_WIDTH + (activeMediaKind ? MEDIA_MENU_WIDTH : 0);
    const maxHeight = Math.min(COMMAND_MENU_MAX_HEIGHT, viewportHeight - MENU_MARGIN * 2);

    // Prefer just below the caret line; flip ABOVE only when it can't fit below
    // and there is room above. The above-anchor uses the caret TOP (not bottom),
    // so a flipped menu sits cleanly above the line being typed instead of
    // covering it.
    const belowTop = position.y + MENU_GAP;
    const aboveTop = position.top - MENU_GAP - maxHeight;
    const overflowsBelow = belowTop + maxHeight > viewportHeight - MENU_MARGIN;
    const top = overflowsBelow && aboveTop >= MENU_MARGIN
      ? aboveTop
      : clamp(belowTop, MENU_MARGIN, viewportHeight - maxHeight - MENU_MARGIN);

    return {
      top,
      left: clamp(position.x, MENU_MARGIN, viewportWidth - width - MENU_MARGIN),
      maxHeight,
    };
  }, [activeMediaKind, position.x, position.y, position.top]);

  if (filtered.length === 0 && !activeMediaKind) {
    return null;
  }

  const activeMediaCommand =
    activeMediaKind &&
    filtered.find(
      (command) =>
        command.kind === "media-picker" &&
        command.mediaKind === activeMediaKind,
    );

  let commandIndex = -1;

  if (typeof document === "undefined") {
    return null;
  }

  // Portal to <body> so `position: fixed` resolves against the viewport. The
  // editor page sets `container-type: size` (for the TOC rail), which makes it a
  // containing block for fixed descendants — rendered inline, the menu would
  // anchor to the page box, not the viewport, and drift off the caret.
  return createPortal(
    <div
      ref={ref}
      data-testid="slash-command-menu"
      className="fixed z-[var(--osio-z-popover)] flex max-h-[26rem] overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]"
      style={menuStyle}
    >
      <div className="flex w-64 min-w-0 flex-col">
        <div className="max-h-[26rem] overflow-y-auto py-1.5">
          {sections.length === 0 ? (
            <div className="px-3 py-5 text-xs text-[var(--osio-fg-subtle)]">
              No commands match “{filter}”.
            </div>
          ) : (
            sections.map((section, sectionIndex) => (
              <React.Fragment key={section.id}>
                {sectionIndex > 0 && (
                  <div className="mx-3 my-1 border-t border-[var(--osio-border-default)]" />
                )}
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
                  {section.label}
                </p>
                {section.items.map((item) => {
                  commandIndex += 1;
                  const idx = commandIndex;
                  const isActive = idx === effectiveActiveIdx;
                  const isPickerSelected =
                    item.kind === "media-picker" &&
                    item.mediaKind === activeMediaKind;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid="slash-command-entry"
                      data-command-label={item.label}
                      className={`mx-1 flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left transition-colors duration-[120ms] [width:calc(100%-0.5rem)] ${
                        isActive || isPickerSelected
                          ? "bg-[var(--osio-bg-muted)]"
                          : "hover:bg-[var(--osio-bg-hover)]"
                      }`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => handleCommandSelect(item)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-xs text-[var(--osio-fg-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[var(--osio-fg-default)]">
                          {item.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </div>
      </div>

      {activeMediaKind && (
        <div
          data-testid="slash-media-picker"
          className="flex w-[296px] min-w-0 flex-col border-l border-[var(--osio-border-default)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] px-3 py-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--osio-fg-subtle)]">
                Media
              </p>
              <p className="text-sm text-[var(--osio-fg-default)]">
                {activeMediaCommand?.label ?? activeMediaKind}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              onClick={() => setActiveMediaKind(null)}
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <MediaAssetPicker
              kind={activeMediaKind}
              label={activeMediaCommand?.label}
              onSelect={(value) => onMediaSelect(activeMediaKind, value)}
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};
