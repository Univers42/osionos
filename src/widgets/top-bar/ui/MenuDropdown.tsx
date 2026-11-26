/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MenuDropdown.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Check, ChevronRight } from "lucide-react";
import { cx } from "@osionos/ui/shared/classNames";
import { isSubmenu, type MenuAction, type MenuItem, type MenuSubmenu } from "../model/menuTypes";

export interface MenuDropdownProps {
  items: MenuItem[];
  onSelect: (item: MenuAction) => void;
  /** 0 = the top menu, 1 = a submenu. */
  level?: 0 | 1;
  /** The submenu currently open inside this panel. */
  subId?: string | null;
  onSub?: (id: string | null) => void;
  align?: "left" | "right";
  /** Cap the height and scroll (a long, data-driven list). */
  scroll?: boolean;
}

interface RowProps {
  item: MenuAction;
  withCheckSlot: boolean;
  onSelect: (item: MenuAction) => void;
  onHover: () => void;
}

const ACCELERATOR = "pl-6 font-mono text-xs text-[var(--osio-fg-subtle)]";

/** A runnable row: `aria-disabled` rows stay focusable and never run; `checked` rows are checkboxes. */
const ActionRow: React.FC<RowProps> = ({ item, withCheckSlot, onSelect, onHover }) => {
  const disabled = item.disabled?.() ?? false;
  const checked = item.checked?.();
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-menu-id={item.id}
      data-menu-label={item.label}
      onPointerEnter={onHover}
      onClick={() => { if (!disabled) onSelect(item); }}
      className={cx("osio-menu-item justify-between", disabled && "opacity-50")}
    >
      <span className="flex items-center gap-2">
        {withCheckSlot && <span className="inline-flex w-4 justify-center">{checked && <Check size={14} aria-hidden />}</span>}
        {item.label}
      </span>
      {item.accelerator && <span className={ACCELERATOR}>{item.accelerator}</span>}
    </button>
  );
};

interface SubmenuRowProps {
  item: MenuSubmenu;
  open: boolean;
  onSelect: (item: MenuAction) => void;
  onSub: (id: string | null) => void;
}

/** A row that opens a one-level panel to its right while `open`. */
const SubmenuRow: React.FC<SubmenuRowProps> = ({ item, open, onSelect, onSub }) => (
  <div className="relative" onPointerEnter={() => onSub(item.id)}>
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open}
      tabIndex={-1}
      data-menu-id={item.id}
      data-menu-label={item.label}
      onClick={() => onSub(open ? null : item.id)}
      className={cx("osio-menu-item justify-between", open && "bg-[var(--osio-bg-hover)]")}
    >
      <span>{item.label}</span>
      <ChevronRight size={14} aria-hidden className="text-[var(--osio-fg-subtle)]" />
    </button>
    {open && <MenuDropdown items={item.children} onSelect={onSelect} level={1} />}
  </div>
);

/** One menu panel (popover tier, token-styled); a submenu renders only while open. */
export const MenuDropdown: React.FC<MenuDropdownProps> = ({ items, onSelect, level = 0, subId = null, onSub, align = "left", scroll }) => {
  const withCheckSlot = items.some((item) => !isSubmenu(item) && item.checked !== undefined);
  const closeSub = (): void => onSub?.(null);
  return (
    <div
      role="menu"
      data-menu-level={level}
      className={cx(
        "osio-surface-overlay absolute z-[var(--osio-z-popover)] min-w-[210px]",
        level === 0 ? "top-full mt-1" : "left-full top-0 ml-1",
        level === 0 && (align === "right" ? "right-0" : "left-0"),
        scroll && "max-h-72 overflow-y-auto",
      )}
    >
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {isSubmenu(item)
            ? <SubmenuRow item={item} open={subId === item.id} onSelect={onSelect} onSub={(id) => onSub?.(id)} />
            : <ActionRow item={item} withCheckSlot={withCheckSlot} onSelect={onSelect} onHover={closeSub} />}
          {item.separatorAfter && <div className="osio-menu-separator" aria-hidden />}
        </React.Fragment>
      ))}
    </div>
  );
};
