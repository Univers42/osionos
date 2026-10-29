/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TurnIntoMenu.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BlockTypePreview } from "@/entities/block/ui/BlockTypePreview";
import { TURN_INTO_OPTIONS, turnIntoLabel } from "./turnIntoOptions";

interface TurnIntoMenuProps {
  blockType: string;
  onTurnInto: (type: string) => void;
}

const optionIndex = (blockType: string) =>
  Math.max(
    0,
    TURN_INTO_OPTIONS.findIndex((option) => option.type === blockType),
  );

/** The "Turn into" trigger and its block-type submenu, with a live preview card. */
export const TurnIntoMenu: React.FC<TurnIntoMenuProps> = ({
  blockType,
  onTurnInto,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => optionIndex(blockType));
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    if (!open) setActiveIndex(optionIndex(blockType));
    setOpen(!open);
  }, [blockType, open]);

  const pick = useCallback(
    (index: number) => {
      const option = TURN_INTO_OPTIONS[index];
      if (!option) return;
      onTurnInto(option.type);
      close();
    },
    [close, onTurnInto],
  );

  // Keyboard navigation stays on the document: focusing the panel would blur the
  // contentEditable, which drops the selection the toolbar exists for.
  useEffect(() => {
    if (!open) return undefined;
    const last = TURN_INTO_OPTIONS.length - 1;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setActiveIndex((current) => {
          const next = event.key === "ArrowDown" ? current + 1 : current - 1;
          return next < 0 ? last : next > last ? 0 : next;
        });
      } else if (event.key === "Enter" || event.key === " ") {
        pick(activeIndex);
      } else if (event.key === "Escape") {
        close();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [activeIndex, close, open, pick]);

  const active = TURN_INTO_OPTIONS[activeIndex] ?? TURN_INTO_OPTIONS[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Turn into"
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        <span className="max-w-24 truncate">{turnIntoLabel(blockType)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--osio-fg-subtle)]" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-[var(--osio-z-max)] mt-1.5 flex items-start gap-2">
          <div
            role="menu"
            aria-label="Turn into"
            className="w-60 shrink-0 osio-surface-overlay p-1"
            onMouseDown={(event) => event.preventDefault()}
          >
            <p className="osio-menu-label">Turn into</p>
            {TURN_INTO_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const isCurrent = option.type === blockType;
              return (
                <button
                  key={option.type}
                  type="button"
                  role="menuitem"
                  data-block-type={option.type}
                  data-active={index === activeIndex}
                  aria-current={isCurrent ? "true" : undefined}
                  className="osio-menu-item h-7"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(index)}
                >
                  <Icon aria-hidden className="h-5 w-5 shrink-0" />
                  <span className="flex-1 truncate">{option.label}</span>
                  {isCurrent ? (
                    <Check
                      aria-hidden
                      data-testid="turn-into-current-check"
                      className="h-4 w-4 shrink-0"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            data-testid="block-type-preview"
            className="shrink-0"
            onMouseDown={(event) => event.preventDefault()}
          >
            <BlockTypePreview type={active.previewType} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
