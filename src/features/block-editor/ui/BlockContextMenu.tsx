/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockContextMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 20:16:32 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { createRef, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  BlockContextMenuItem,
  BlockContextMenuSection,
  BlockContextMenuState,
} from "../model/blockContextMenu.helpers";

interface BlockContextMenuProps {
  menu: BlockContextMenuState | null;
  sections: BlockContextMenuSection[];
  onClose: () => void;
  width?: number;
}

function clampMenuPosition(y: number, x: number, width: number) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxHeight = Math.min(520, viewportHeight - 24);
  const left = Math.max(12, Math.min(x, viewportWidth - width - 12));
  const top = Math.max(12, Math.min(y, viewportHeight - maxHeight - 12));
  return { top, left, maxHeight };
}

function getItemClassName(item: BlockContextMenuItem) {
  const base = "relative flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors";
  if (item.danger) return `${base} text-red-600 hover:bg-red-50`;
  if (item.active) return `${base} bg-[var(--color-surface-hover)] text-[var(--color-ink)]`;
  if (item.disabled) return `${base} cursor-default text-[var(--color-ink-faint)]`;
  return `${base} cursor-pointer text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]`;
}

interface SubmenuButtonProps {
  parentLabel: string;
  item: BlockContextMenuItem;
  onSelect: (event: React.MouseEvent, onClick: () => void) => void;
}

const SubmenuButton: React.FC<SubmenuButtonProps> = ({
  parentLabel,
  item,
  onSelect,
}) => {
  const handleClick = useCallback(
    (event: React.MouseEvent) => onSelect(event, item.onClick),
    [item.onClick, onSelect],
  );

  return (
    <button
      key={`${parentLabel}-${item.label}`}
      type="button"
      onClick={handleClick}
      disabled={item.disabled}
      className={[
        "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] disabled:cursor-default disabled:text-[var(--color-ink-faint)] disabled:hover:bg-transparent",
        item.active ? "bg-[var(--color-surface-hover)]" : "",
      ].join(" ")}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)]">
        {item.icon}
      </span>
      <span className="flex-1 text-sm">{item.label}</span>
      {item.active ? <span className="text-xs">✓</span> : null}
    </button>
  );
};

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  menu,
  sections,
  onClose,
  width = 260,
}) => {
  const ref = useMemo(() => createRef<HTMLDivElement>(), []);
  const [query, setQuery] = useState("");
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const active = Boolean(menu);

  useEffect(() => {
    if (!active) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onClose, ref]);

  useEffect(() => {
    if (active) {
      // schedule state updates to avoid synchronous setState inside effect
      const id = setTimeout(() => {
        setQuery("");
        setOpenSubmenu(null);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [active]);

  const handleSubItemClick = useCallback(
    (event: React.MouseEvent, onClick: () => void) => {
      event.stopPropagation();
      onClick();
    },
    [],
  );

  const position = useMemo(() => {
    if (!menu) return null;
    return clampMenuPosition(menu.y, menu.x, width);
  }, [menu, width]);

  if (!menu || !position || sections.length === 0) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = normalizedQuery
    ? sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            item.label.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((section) => section.items.length > 0)
    : sections;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 border-0 bg-transparent p-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close block context menu"
        style={{ zIndex: 10000 }}
      />
      <div
        ref={ref}
        className="fixed overflow-visible rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] py-2 shadow-xl"
        style={{
          top: position.top,
          left: position.left,
          width,
          maxHeight: position.maxHeight,
          zIndex: 10001,
        }}
      >
        <div className="px-2 pb-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions…"
            className="h-8 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-secondary)] px-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="max-h-[430px] overflow-visible">
        {visibleSections.map((section, index) => (
          <div key={`${section.label ?? "section"}-${index}`}>
            {section.label ? (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                {section.label}
              </p>
            ) : null}
            {section.items.map((item) => (
              <div
                key={`${section.label ?? "section"}-${item.label}`}
                role="menuitem"
                tabIndex={item.disabled ? -1 : 0}
                onMouseEnter={() => setOpenSubmenu(item.subItems ? item.label : null)}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.subItems) {
                    setOpenSubmenu(openSubmenu === item.label ? null : item.label);
                    return;
                  }
                  item.onClick();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (item.disabled) return;
                  if (item.subItems) {
                    setOpenSubmenu(openSubmenu === item.label ? null : item.label);
                    return;
                  }
                  item.onClick();
                }}
                className={getItemClassName(item)}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                {item.shortcut ? (
                  <span className="text-[11px] text-[var(--color-ink-faint)]">
                    {item.shortcut}
                  </span>
                ) : null}
                {item.subItems ? (
                  <span className="text-[var(--color-ink-faint)]">›</span>
                ) : null}
                {item.subItems && openSubmenu === item.label ? (
                  <div className="absolute left-full top-0 z-10 ml-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] py-1 shadow-xl">
                    {item.subItems.map((subItem) => (
                      <SubmenuButton
                        key={`${item.label}-${subItem.label}`}
                        parentLabel={item.label}
                        item={subItem}
                        onSelect={handleSubItemClick}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {index < visibleSections.length - 1 ? (
              <div className="my-1 border-t border-[var(--color-line)]" />
            ) : null}
          </div>
        ))}
        </div>
        <div className="mt-1 border-t border-[var(--color-line)] px-3 pt-2 text-[11px] leading-4 text-[var(--color-ink-faint)]">
          <div>Last edited by current user</div>
          <div>Today</div>
        </div>
      </div>
    </>,
    document.body,
  );
};
