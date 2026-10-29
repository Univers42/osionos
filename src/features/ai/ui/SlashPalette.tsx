/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SlashPalette.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The "/" palette: a listbox of commands over the composer.
 *
 * The textarea keeps the focus and the keyboard; the palette is driven by it
 * through aria-activedescendant, so it renders rows and reports pointer
 * picks, nothing more.
 */

import React from "react";

import type { ChatCommand } from "../model/chatCommands";

export const SLASH_LISTBOX_ID = "ai-slash-palette";

/** The id the textarea points aria-activedescendant at. */
export const slashOptionId = (name: string): string => `${SLASH_LISTBOX_ID}-${name}`;

interface Props {
  commands: ChatCommand[];
  query: string;
  index: number;
  /** Above the composer when there is no room below it. */
  placement: "above" | "below";
  onHover: (index: number) => void;
  onPick: (command: ChatCommand) => void;
}

// The transition is off under prefers-reduced-motion; no animation library.
const MOTION = "transition-[opacity,transform] duration-[120ms] motion-reduce:transition-none";

export const SlashPalette: React.FC<Props> = ({ commands, query, index, placement, onHover, onPick }) => (
  <div
    id={SLASH_LISTBOX_ID}
    role="listbox"
    aria-label="Commands"
    className={`absolute left-0 z-50 max-h-72 w-80 max-w-full overflow-y-auto rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-[var(--osio-shadow-md,0_8px_24px_rgba(0,0,0,0.16))] ${MOTION} ${placement === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
  >
    {commands.length === 0 ? (
      <p className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">No command matches /{query}</p>
    ) : (
      commands.map((command, position) => {
        const selected = position === index;
        return (
          <div
            key={command.name}
            id={slashOptionId(command.name)}
            role="option"
            aria-selected={selected}
            onMouseEnter={() => onHover(position)}
            // Keep the textarea focused: a mousedown on the row would blur it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(command)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
              selected ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "text-[var(--osio-fg-default)]"
            }`}
          >
            <span className="font-mono">/{command.name}</span>
            <span className={`min-w-0 flex-1 truncate ${selected ? "opacity-80" : "text-[var(--osio-fg-muted)]"}`}>
              {command.description}
            </span>
            <span className="shrink-0 rounded-xs border border-current px-1 text-3xs uppercase opacity-70">
              {command.kind}
            </span>
          </div>
        );
      })
    )}
  </div>
);
