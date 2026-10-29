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

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { BlockTypePreview } from "@/entities/block/ui/BlockTypePreview";
import {
  TURN_INTO_OPTIONS,
  turnIntoRowLabel,
} from "./turnIntoOptions";

interface TurnIntoMenuProps {
  blockType: string;
  onTurnInto: (type: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const optionIndex = (blockType: string) =>
  Math.max(
    0,
    TURN_INTO_OPTIONS.findIndex((option) => option.type === blockType),
  );

/**
 * The panel's first row and its flyout. The flyout opens to the right of the
 * panel, flips left when there is no room, and keeps the live preview card the
 * old horizontal menu introduced.
 */
export const TurnIntoMenu: React.FC<TurnIntoMenuProps> = ({
  blockType,
  onTurnInto,
  open,
  onOpenChange,
}) => {
  const [activeIndex, setActiveIndex] = useState(() => optionIndex(blockType));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Place the flyout without a state round-trip: right of the panel by
  // default, flipped left when that would cross the viewport edge.
  useLayoutEffect(() => {
    const flyout = flyoutRef.current;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!open || !flyout || !trigger) return;
    const width = flyout.offsetWidth;
    const panelRight = trigger.right + 6;
    const noRoomRight = panelRight + 4 + width > window.innerWidth - 8;
    const roomLeft = trigger.left - 6 - 4 - width >= 8;
    const flip = noRoomRight && roomLeft;
    if (flip) {
      flyout.style.left = "";
      flyout.style.right = `${window.innerWidth - (trigger.left - 6 - 4)}px`;
    } else {
      flyout.style.right = "";
      flyout.style.left = `${panelRight + 4}px`;
    }
    flyout.style.top = `${trigger.top}px`;
    flyout.style.flexDirection = flip ? "row-reverse" : "row";
  }, [open]);

  const openMenu = useCallback(() => {
    setActiveIndex(optionIndex(blockType));
    onOpenChange(true);
  }, [blockType, onOpenChange]);

  const pick = useCallback(
    (index: number) => {
      const option = TURN_INTO_OPTIONS[index];
      if (!option) return;
      onTurnInto(option.type);
      close();
    },
    [close, onTurnInto],
  );

  // Keyboard navigation stays on the document: focusing the panel would blur
  // the contentEditable, which drops the selection the panel exists for.
  useEffect(() => {
    if (!open) return undefined;
    const last = TURN_INTO_OPTIONS.length - 1;
    const onDown = (event: MouseEvent) => {
      if (!flyoutRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setActiveIndex((current) => {
          const next = event.key === "ArrowDown" ? current + 1 : current - 1;
          return next < 0 ? last : next > last ? 0 : next;
        });
      } else if (event.key === "Enter" || event.key === " ") {
        pick(activeIndex);
      } else if (event.key === "Escape" || event.key === "ArrowLeft") {
        close();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [activeIndex, close, open, pick]);

  const active = TURN_INTO_OPTIONS[activeIndex] ?? TURN_INTO_OPTIONS[0];
  const CurrentIcon =
    TURN_INTO_OPTIONS.find((option) => option.type === blockType)?.icon ??
    TURN_INTO_OPTIONS[0].icon;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        title="Turn into"
        aria-label="Turn into"
        aria-haspopup="menu"
        aria-expanded={open}
        data-selection-panel-control
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-menu-item-hover-bg)] data-[kb-active=true]:bg-[var(--osio-menu-item-hover-bg)]"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={openMenu}
        onClick={openMenu}
      >
        <CurrentIcon aria-hidden className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate text-left">
          {turnIntoRowLabel(blockType)}
        </span>
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-[var(--osio-fg-subtle)]"
        />
      </button>

      {open ? (
        <div
          ref={flyoutRef}
          className="fixed z-[var(--osio-z-max)] flex items-start gap-2"
          style={{ left: "calc(100% + 4px)" }}
        >
          <div
            role="menu"
            aria-label="Turn into"
            className="max-h-[70vh] w-60 shrink-0 overflow-y-auto osio-surface-overlay p-1"
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
