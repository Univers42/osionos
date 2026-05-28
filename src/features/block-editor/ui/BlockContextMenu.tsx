/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockContextMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 01:16:20 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  BlockContextMenuItem,
  BlockContextMenuSection,
  BlockContextMenuState,
} from "../model/blockContextMenu.helpers";
import { useBlockColorProfileStore } from "@/shared/config/blockColorProfileStore";
import {
  clampAnchoredPanelPosition,
  clampViewportMenuPosition,
  useClickOutside,
  useEscapeKey,
} from "@/shared/ui";

const SUBMENU_WIDTH = 224; // w-56 = 14rem = 224px
const PROFILE_PANEL_WIDTH = 288;
const VIEWPORT_PAD = 12;

interface BlockContextMenuProps {
  menu: BlockContextMenuState | null;
  sections: BlockContextMenuSection[];
  onClose: () => void;
  width?: number;
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
 */
interface SubmenuPanelProps {
  anchor: { top: number; left: number } | null;
  parentWidth: number;
  items: BlockContextMenuItem[];
  parentLabel: string;
  onSelect: (event: React.MouseEvent, onClick: () => void) => void;
}

const SubmenuPanel: React.FC<SubmenuPanelProps> = ({
  anchor,
  parentWidth,
  items,
  parentLabel,
  onSelect,
}) => {
  const style = useMemo<React.CSSProperties>(() => {
    if (!anchor) return { position: "fixed", opacity: 0 };

    const position = clampAnchoredPanelPosition(
      anchor,
      parentWidth,
      SUBMENU_WIDTH,
      globalThis.innerHeight - VIEWPORT_PAD * 2,
      VIEWPORT_PAD,
    );

    return {
      position: "fixed",
      top: position.top,
      left: position.left,
      width: SUBMENU_WIDTH,
      maxHeight: position.maxHeight,
      zIndex: 10002,
    };
  }, [anchor, parentWidth]);

  return (
    <div
      data-submenu-panel
      className="overflow-y-auto rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-xl"
      style={style}
    >
      {items.map((subItem, index) => (
        <SubmenuButton
          key={`${parentLabel}-${subItem.label}-${index}`}
          parentLabel={parentLabel}
          item={subItem}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

interface ColorProfilePanelProps {
  style: React.CSSProperties;
}

const ColorProfilePanel: React.FC<ColorProfilePanelProps> = ({ style }) => {
  const profiles = useBlockColorProfileStore((state) => state.profiles);
  const addProfile = useBlockColorProfileStore((state) => state.addProfile);
  const removeProfile = useBlockColorProfileStore((state) => state.removeProfile);
  const [name, setName] = useState("Custom profile");
  const [textColor, setTextColor] = useState("#1f2937");
  const [backgroundColor, setBackgroundColor] = useState("#f3f4f6");

  const handleSubmit = useCallback((event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    addProfile({
      name,
      textColor,
      backgroundColor,
    });
    setName("Custom profile");
  }, [addProfile, backgroundColor, name, textColor]);

  return (
    <aside
      className="fixed overflow-y-auto rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3 shadow-xl"
      style={{ ...style, width: PROFILE_PANEL_WIDTH, zIndex: 10003 }}
      aria-label="Color profile properties"
    >
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--osio-fg-subtle)]">
          Color Profiles
        </p>
        <p className="text-sm text-[var(--osio-fg-default)]">
          Reusable foreground and background pairs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3">
        <label className="block text-xs font-medium text-[var(--osio-fg-muted)]">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-[var(--osio-fg-muted)]">
            <span>Text</span>
            <input
              type="color"
              value={textColor}
              onChange={(event) => setTextColor(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[var(--osio-border-default)] bg-transparent"
            />
          </label>
          <label className="text-xs font-medium text-[var(--osio-fg-muted)]">
            <span>Background</span>
            <input
              type="color"
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[var(--osio-border-default)] bg-transparent"
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          + Save profile
        </button>
      </form>

      <div className="mt-3 space-y-1">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] px-2 py-1.5"
          >
            <span
              className="h-5 w-5 rounded border border-[var(--osio-border-default)]"
              style={{ backgroundColor: profile.backgroundColor }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
              {profile.name}
            </span>
            <button
              type="button"
              className="rounded px-1.5 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              onClick={() => removeProfile(profile.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </aside>
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
  const [submenuAnchor, setSubmenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const openItemSubmenu = useCallback(
    (target: HTMLElement) => {
      if (item.panelOnly) {
        setOpenSubmenu(item.label);
        return;
      }
      if (!item.subItems?.length) {
        setSubmenuAnchor(null);
        setOpenSubmenu(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      setSubmenuAnchor({ top: rect.top, left: rect.left });
      setOpenSubmenu(item.label);
    },
    [item.label, item.panelOnly, item.subItems, setOpenSubmenu],
  );

  const closeItemSubmenu = useCallback(() => {
    setSubmenuAnchor(null);
    setOpenSubmenu(null);
  }, [setOpenSubmenu]);

  return (
    <div
      role="menuitem"
      tabIndex={item.disabled ? -1 : 0}
      onMouseEnter={(event) => openItemSubmenu(event.currentTarget)}
      onClick={(event) => {
        if (item.disabled) return;
        if (item.subItems?.length || item.panelOnly) {
          if (openSubmenu === item.label) closeItemSubmenu();
          else openItemSubmenu(event.currentTarget);
          return;
        }
        item.onClick();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (item.disabled) return;
        if (item.subItems?.length || item.panelOnly) {
          if (openSubmenu === item.label) closeItemSubmenu();
          else openItemSubmenu(event.currentTarget);
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
      {item.subItems?.length || item.panelOnly ? (
        <span className="text-[var(--osio-fg-subtle)]">›</span>
      ) : null}
      {item.subItems?.length && !item.panelOnly && openSubmenu === item.label ? (
        <SubmenuPanel
          anchor={submenuAnchor}
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
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const active = Boolean(menu);

  useClickOutside(ref, onClose, active);
  useEscapeKey(onClose, active);

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
    return clampViewportMenuPosition(menu.x, menu.y, {
      width,
      maxHeight: 520,
      margin: VIEWPORT_PAD,
    });
  }, [menu, width]);

  const profilePanelPosition = useMemo(() => {
    if (!position || openSubmenu !== "Create color profile") return null;
    return clampAnchoredPanelPosition(
      position,
      width,
      PROFILE_PANEL_WIDTH,
      Math.min(520, position.maxHeight),
      VIEWPORT_PAD,
    );
  }, [openSubmenu, position, width]);

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
        className="fixed overflow-hidden rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-2 shadow-xl"
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
        <div className="max-h-[400px] overflow-y-auto" role="menu">
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
      {profilePanelPosition ? <ColorProfilePanel style={profilePanelPosition} /> : null}
    </>,
    document.body,
  );
};
