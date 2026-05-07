/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockContextMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 16:29:50 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  BlockContextMenuItem,
  BlockContextMenuSection,
  BlockContextMenuState,
} from "../model/blockContextMenu.helpers";

const SUBMENU_WIDTH = 224; // w-56 = 14rem = 224px
const VIEWPORT_PAD = 12;

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
  if (item.danger) return `${base} text-[var(--osio-danger)] hover:bg-[var(--osio-bg-subtle)]`;
  if (item.active) return `${base} bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]`;
  if (item.disabled) return `${base} cursor-default text-[var(--osio-fg-subtle)]`;
  return `${base} cursor-pointer text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]`;
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
        "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:cursor-default disabled:text-[var(--osio-fg-subtle)] disabled:hover:bg-transparent",
        item.active ? "bg-[var(--osio-bg-hover)]" : "",
      ].join(" ")}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {item.icon}
      </span>
      <span className="flex-1 text-sm">{item.label}</span>
      {item.active ? <span className="text-xs">✓</span> : null}
    </button>
  );
};

/**
 * Submenu panel that positions itself using fixed coordinates clamped
 * to the viewport, so it never extends beyond the visible area.
 * It measures the parent menuitem via anchorRef to decide placement.
 */
interface SubmenuPanelProps {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  parentWidth: number;
  items: BlockContextMenuItem[];
  parentLabel: string;
  onSelect: (event: React.MouseEvent, onClick: () => void) => void;
}

const SubmenuPanel: React.FC<SubmenuPanelProps> = ({
  anchorRef,
  parentWidth,
  items,
  parentLabel,
  onSelect,
}) => {
  const style = useMemo<React.CSSProperties>(() => {
    const anchor = anchorRef.current;
    if (!anchor) return { position: "fixed", opacity: 0 };

    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer opening to the right of the parent menu
    let left = rect.right + 8;
    if (left + SUBMENU_WIDTH + VIEWPORT_PAD > vw) {
      left = rect.left - SUBMENU_WIDTH - 8;
    }
    left = Math.max(VIEWPORT_PAD, Math.min(left, vw - SUBMENU_WIDTH - VIEWPORT_PAD));

    // Vertical: align to anchor top, clamp so the panel stays in viewport
    const maxH = vh - VIEWPORT_PAD * 2;
    let top = rect.top;
    if (top + maxH > vh) {
      top = vh - maxH - VIEWPORT_PAD;
    }
    top = Math.max(VIEWPORT_PAD, top);

    return {
      position: "fixed",
      top,
      left,
      width: SUBMENU_WIDTH,
      maxHeight: maxH,
      zIndex: 10002,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef, parentWidth]);

  return (
    <div
      className="overflow-y-auto rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-xl"
      style={style}
    >
      {items.map((subItem) => (
        <SubmenuButton
          key={`${parentLabel}-${subItem.label}`}
          parentLabel={parentLabel}
          item={subItem}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

/**
 * Single menu item row with optional submenu support.
 * Provides a ref to its own DOM node so SubmenuPanel can measure
 * the anchor position for viewport-clamped placement.
 */
interface MenuItemRowProps {
  item: BlockContextMenuItem;
  openSubmenu: string | null;
  setOpenSubmenu: (label: string | null) => void;
  parentWidth: number;
  onSubItemClick: (event: React.MouseEvent, onClick: () => void) => void;
}

const MenuItemRow: React.FC<MenuItemRowProps> = ({
  item,
  openSubmenu,
  setOpenSubmenu,
  parentWidth,
  onSubItemClick,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 text-sm">{item.label}</span>
      {item.shortcut ? (
        <span className="text-xs text-[var(--osio-fg-subtle)]">
          {item.shortcut}
        </span>
      ) : null}
      {item.subItems ? (
        <span className="text-[var(--osio-fg-subtle)]">›</span>
      ) : null}
      {item.subItems && openSubmenu === item.label ? (
        <SubmenuPanel
          anchorRef={rowRef}
          parentWidth={parentWidth}
          items={item.subItems}
          parentLabel={item.label}
          onSelect={onSubItemClick}
        />
      ) : null}
    </div>
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
        className="fixed overflow-visible rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-2 shadow-xl"
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
            className="h-8 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)] focus:border-[var(--osio-accent)]"
          />
        </div>
        <div className="max-h-[430px] overflow-visible" role="menu">
        {visibleSections.map((section, index) => (
          <div key={`${section.label ?? "section"}-${index}`}>
            {section.label ? (
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
                {section.label}
              </p>
            ) : null}
            {section.items.map((item) => (
              <MenuItemRow
                key={`${section.label ?? "section"}-${item.label}`}
                item={item}
                openSubmenu={openSubmenu}
                setOpenSubmenu={setOpenSubmenu}
                parentWidth={width}
                onSubItemClick={handleSubItemClick}
              />
            ))}
            {index < visibleSections.length - 1 ? (
              <div className="my-1 border-t border-[var(--osio-border-default)]" />
            ) : null}
          </div>
        ))}
        </div>
        <div className="mt-1 border-t border-[var(--osio-border-default)] px-3 pt-2 text-xs leading-4 text-[var(--osio-fg-subtle)]">
          <div>Last edited by current user</div>
          <div>Today</div>
        </div>
      </div>
    </>,
    document.body,
  );
};
