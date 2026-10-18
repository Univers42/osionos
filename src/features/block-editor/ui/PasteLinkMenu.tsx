/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PasteLinkMenu.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PASTE_CHOICES, type PasteChoice } from "../model/pasteLinkMenu";

const MENU_MARGIN = 8;
const MENU_GAP = 6;
const MENU_WIDTH = 256;
// Caveat: an estimate of the rendered height (header + four rows), used only to decide
// whether the menu flips above the link. A larger root font size or a wrapped
// description makes the real menu taller, so it can overlap the viewport edge by a few px.
const MENU_HEIGHT = 176;

interface PasteLinkMenuProps {
  position: { x: number; y: number; top: number };
  initialChoice: PasteChoice;
  onChoose: (choice: PasteChoice) => void;
  /** Escape, a click elsewhere or typing: the pasted link stays as it is. */
  onDismiss: () => void;
}

function menuStyle(position: PasteLinkMenuProps["position"]): React.CSSProperties {
  const vw = globalThis.innerWidth || 1024;
  const vh = globalThis.innerHeight || 768;
  const flipsAbove = position.y + MENU_GAP + MENU_HEIGHT > vh - MENU_MARGIN && position.top - MENU_GAP - MENU_HEIGHT >= MENU_MARGIN;
  return {
    top: flipsAbove ? position.top - MENU_GAP - MENU_HEIGHT : position.y + MENU_GAP,
    left: Math.min(Math.max(position.x, MENU_MARGIN), Math.max(MENU_MARGIN, vw - MENU_WIDTH - MENU_MARGIN)),
  };
}

export const PasteLinkMenu: React.FC<PasteLinkMenuProps> = ({ position, initialChoice, onChoose, onDismiss }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, PASTE_CHOICES.findIndex((entry) => entry.choice === initialChoice)),
  );

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onDismiss]);

  // The editor keeps focus, so keys are read in the capture phase before it sees them.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === "ArrowDown" ? 1 : PASTE_CHOICES.length - 1;
        setActiveIndex((index) => (index + step) % PASTE_CHOICES.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onChoose(PASTE_CHOICES[activeIndex].choice);
      } else if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      } else if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeIndex, onChoose, onDismiss]);

  const style = useMemo(() => menuStyle(position), [position]);

  // Portal to <body>: `position: fixed` must resolve against the viewport, not the
  // editor page's size-container (same reason as PageSelectorMenu).
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Paste as"
      data-testid="paste-link-menu"
      className="osio-surface-overlay fixed z-[var(--osio-z-popover)] flex w-64 flex-col overflow-hidden"
      style={style}
    >
      <p className="osio-menu-label">Paste as</p>
      {/* Focus stays in the editor, so aria-activedescendant has no focused element to live
          on; the active row is announced through this polite live region instead. */}
      <p role="status" aria-live="polite" className="sr-only">
        {`${PASTE_CHOICES[activeIndex].label}, ${PASTE_CHOICES[activeIndex].description}, ${activeIndex + 1} of ${PASTE_CHOICES.length}`}
      </p>
      {PASTE_CHOICES.map((entry, index) => (
        <button
          key={entry.choice}
          type="button"
          role="menuitem"
          className="osio-menu-item"
          data-choice={entry.choice}
          aria-current={index === activeIndex ? "true" : undefined}
          data-active={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => onChoose(entry.choice)}
        >
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <span className="truncate text-xs text-[var(--osio-fg-subtle)]">{entry.description}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
};
