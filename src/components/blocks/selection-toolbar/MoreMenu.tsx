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
import { ToolbarIconButton, TOOLBAR_ICON } from "./ToolbarButton";

interface MoreMenuProps {
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  onOpenSlashMenu: () => void;
}

/**
 * The last grid cell: a popover with the two actions that no longer have a
 * permanent row. It renders INSIDE the panel root so the shared test helper
 * (`button[title=...]` scoped to the panel) still finds both rows.
 */
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
    <div ref={rootRef} className="relative h-9 w-9">
      <ToolbarIconButton
        label="More"
        active={shortcutsOpen}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className={TOOLBAR_ICON} aria-hidden />
      </ToolbarIconButton>

      {open ? (
        <div
          role="menu"
          aria-label="More"
          className="absolute right-0 top-full z-[var(--osio-z-max)] mt-1 w-52 osio-surface-overlay p-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            title="Open slash menu"
            data-selection-panel-control
            className="osio-menu-item h-7"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onOpenSlashMenu();
              close();
            }}
          >
            Open slash menu
          </button>
          <button
            type="button"
            role="menuitem"
            title="Keyboard shortcuts"
            data-selection-panel-control
            className="osio-menu-item h-7"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onToggleShortcuts();
              close();
            }}
          >
            Keyboard shortcuts
          </button>
        </div>
      ) : null}
    </div>
  );
};
