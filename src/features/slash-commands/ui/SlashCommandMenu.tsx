/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashCommandMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 16:29:52 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MediaBlockType } from "@/entities/block";
import { MediaAssetPicker } from "@/shared/ui/molecules/MediaAssetPicker";
import {
  filterSlashCommands,
  groupSlashCommands,
} from "@/features/slash-commands/model/slashMenuCatalog";
import type {
  SlashCreatePageCommand,
  SlashBlockCommand,
  SlashCommand,
  SlashInlineCommand,
  SlashMediaPickerCommand,
  SlashTurnIntoCommand,
} from "@/features/slash-commands/model/types";

type SelectableSlashCommand = Exclude<SlashCommand, SlashMediaPickerCommand>;

interface SlashCommandMenuProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (
    item: SlashBlockCommand | SlashTurnIntoCommand | SlashCreatePageCommand | SlashInlineCommand,
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
      className="fixed z-[var(--osio-z-popover)] flex max-h-[26rem] overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-2xl"
      style={{ top: position.y + 4, left: position.x }}
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
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                        isActive || isPickerSelected
                          ? "bg-[var(--osio-bg-hover)]"
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
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]"
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
