/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TurnIntoMenu.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// The block types the selection toolbar can convert to. Content is markdown text,
// so a turn-into is just a `type` swap (BlockEditor re-renders the new shape).
const TURN_INTO_OPTIONS: ReadonlyArray<{ type: string; label: string }> = [
  { type: "paragraph", label: "Text" },
  { type: "heading_1", label: "Heading 1" },
  { type: "heading_2", label: "Heading 2" },
  { type: "heading_3", label: "Heading 3" },
  { type: "bulleted_list", label: "Bulleted list" },
  { type: "numbered_list", label: "Numbered list" },
  { type: "to_do", label: "To-do list" },
  { type: "quote", label: "Quote" },
  { type: "callout", label: "Callout" },
  { type: "code", label: "Code" },
];

const LABEL_BY_TYPE = new Map(TURN_INTO_OPTIONS.map((o) => [o.type, o.label]));

interface TurnIntoMenuProps {
  blockType: string;
  onTurnInto: (type: string) => void;
}

export const TurnIntoMenu: React.FC<TurnIntoMenuProps> = ({ blockType, onTurnInto }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Turn into"
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="max-w-24 truncate">{LABEL_BY_TYPE.get(blockType) ?? "Text"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--osio-fg-subtle)]" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[var(--osio-z-max)] mt-1.5 w-44 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          {TURN_INTO_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="menuitem"
              className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--osio-bg-hover)] ${
                option.type === blockType
                  ? "text-[var(--osio-accent-text)]"
                  : "text-[var(--osio-fg-default)]"
              }`}
              onClick={() => {
                onTurnInto(option.type);
                setOpen(false);
              }}
            >
              {option.label}
              {option.type === blockType ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
