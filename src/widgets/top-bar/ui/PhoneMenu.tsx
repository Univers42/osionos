/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PhoneMenu.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { cx } from "@osionos/ui/shared/classNames";
import { isSubmenu, type MenuAction, type MenuGroup, type MenuItem } from "../model/menuTypes";
import { wrapTab } from "./menuDom";
import { useFocusReturn } from "./useFocusReturn";

const ROW = "osio-menu-item min-h-11 w-full";

/** A tappable row (44px). `aria-disabled` rows never run; a checked row reads as pressed. */
const Row: React.FC<{ item: MenuAction; onRun: (item: MenuAction) => void }> = ({ item, onRun }) => {
  const disabled = item.disabled?.() ?? false;
  const checked = item.checked?.();
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      aria-pressed={checked}
      onClick={() => { if (!disabled) onRun(item); }}
      className={cx(ROW, "justify-between", disabled && "opacity-50")}
    >
      <span>{item.label}</span>
      {checked && <span aria-hidden>On</span>}
    </button>
  );
};

/** A collapsible section; `summary` is the keyboard- and touch-native disclosure control. */
const Section: React.FC<{ label: string; nested?: boolean; children: React.ReactNode }> = ({ label, nested, children }) => (
  <details className={cx(nested && "pl-3")}>
    <summary className={cx(ROW, "flex cursor-pointer items-center justify-between font-medium")}>
      {label}
      <ChevronRight size={14} aria-hidden className="text-[var(--osio-fg-subtle)]" />
    </summary>
    {children}
  </details>
);

/** The items of a group; a submenu is a nested disclosure. */
const Items: React.FC<{ items: MenuItem[]; onRun: (item: MenuAction) => void }> = ({ items, onRun }) => (
  <>
    {items.map((item) => (isSubmenu(item)
      ? <Section key={item.id} label={item.label} nested>{item.children.map((child) => <Row key={child.id} item={child} onRun={onRun} />)}</Section>
      : <Row key={item.id} item={item} onRun={onRun} />))}
  </>
);

/**
 * Below `md` the menubar does not fit: one button opens a top-anchored sheet
 * with every menu as a disclosure. Escape, a tap on the backdrop or a row
 * closes it; Tab wraps inside the sheet. A row runs through `useFocusReturn`
 * (Undo/Redo get the editable first); when no editable takes focus back, focus
 * lands on the button.
 */
export const PhoneMenu: React.FC<{ groups: MenuGroup[] }> = ({ groups }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusReturn = useFocusReturn(rootRef, buttonRef);

  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>("summary")?.focus();
  }, [open]);

  function close(): void {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Tab" && sheetRef.current) wrapTab(sheetRef.current, event);
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
  }

  function run(item: MenuAction): void {
    setOpen(false);
    focusReturn.activate(item);
  }

  return (
    <div ref={rootRef} className="md:hidden" {...focusReturn.captureProps}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--osio-radius-chip)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        <Menu size={18} aria-hidden />
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-[var(--osio-z-popover)]" onPointerDown={close} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            aria-keyshortcuts="Escape"
            onKeyDown={onKeyDown}
            className="osio-surface-overlay fixed inset-x-0 top-[var(--osio-topbar-h)] z-[var(--osio-z-popover)] max-h-[calc(100vh-var(--osio-topbar-h))] overflow-y-auto"
          >
            {groups.map((group) => (
              <Section key={group.id} label={group.label}><Items items={group.items} onRun={run} /></Section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
