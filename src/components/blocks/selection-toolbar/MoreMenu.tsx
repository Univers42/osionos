/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MoreMenu.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { TOOLBAR_ICON } from "./ToolbarButton";

interface MoreMenuProps {
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  onOpenSlashMenu: () => void;
}

/** The toolbar's "More" menu: the shortcuts reference and the slash menu. */
export const MoreMenu: React.FC<MoreMenuProps> = ({
  shortcutsOpen,
  onToggleShortcuts,
  onOpenSlashMenu,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [close, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={shortcutsOpen}
        className="grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className={TOOLBAR_ICON} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="More"
          className="absolute right-0 top-full z-[var(--osio-z-max)] mt-1.5 w-52 osio-surface-overlay p-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            title="Keyboard shortcuts"
            className="osio-menu-item h-7"
            onClick={() => {
              onToggleShortcuts();
              close();
            }}
          >
            Keyboard shortcuts
          </button>
          <button
            type="button"
            role="menuitem"
            title="Open slash menu"
            className="osio-menu-item h-7"
            onClick={() => {
              onOpenSlashMenu();
              close();
            }}
          >
            Open slash menu
          </button>
        </div>
      ) : null}
    </div>
  );
};
