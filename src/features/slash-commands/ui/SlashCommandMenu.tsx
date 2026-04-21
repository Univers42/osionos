/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:29:07 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MediaBlockType } from "@/entities/block";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import {
  filterSlashCommands,
  groupSlashCommands,
} from "@/features/slash-commands/model/slashMenuCatalog";
import type {
  SlashBlockCommand,
  SlashCommand,
  SlashTurnIntoCommand,
} from "@/features/slash-commands/model/types";

interface SlashCommandMenuProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (item: SlashBlockCommand | SlashTurnIntoCommand) => void;
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

      onSelect(command);
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

  return (
    <div
      ref={ref}
      data-testid="slash-command-menu"
      className="fixed z-[10000] flex max-h-[26rem] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] shadow-2xl"
      style={{ top: position.y + 4, left: position.x }}
    >
      <div className="flex w-64 min-w-0 flex-col">
        <div className="max-h-[26rem] overflow-y-auto py-1.5">
          {sections.length === 0 ? (
            <div className="px-3 py-5 text-xs text-[var(--color-ink-faint)]">
              No commands match “{filter}”.
            </div>
          ) : (
            sections.map((section, sectionIndex) => (
              <React.Fragment key={section.id}>
                {sectionIndex > 0 && (
                  <div className="mx-3 my-1 border-t border-[var(--color-line)]" />
                )}
                <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
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
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                        isActive || isPickerSelected
                          ? "bg-[var(--color-surface-hover)]"
                          : "hover:bg-[var(--color-surface-hover)]"
                      }`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => handleCommandSelect(item)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-secondary)] text-[12px] text-[var(--color-ink-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-[var(--color-ink)]">
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
          className="flex w-[296px] min-w-0 flex-col border-l border-[var(--color-line)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
                Media
              </p>
              <p className="text-[13px] text-[var(--color-ink)]">
                {activeMediaCommand?.label ?? activeMediaKind}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]"
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
    </div>
  );
};
