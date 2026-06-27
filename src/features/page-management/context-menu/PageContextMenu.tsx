/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageContextMenu.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { useClickOutside } from "@/shared/ui";
import type { MenuActionCtx, PageMenuAction } from "./types";
import { actionsForTarget } from "./registry";
import styles from "../ui/PageOptionsMenu.module.scss";

interface Props {
  x: number;
  y: number;
  ctx: MenuActionCtx;
  onClose: () => void;
}

const MENU_MARGIN = 8;
const MENU_WIDTH = 240;

/** Group consecutive actions by `section` so dividers land between groups. */
function groupBySection(actions: PageMenuAction[]): PageMenuAction[][] {
  const groups: PageMenuAction[][] = [];
  let current: { key: string | undefined; items: PageMenuAction[] } | null = null;
  for (const action of actions) {
    if (!current || current.key !== action.section) {
      current = { key: action.section, items: [action] };
      groups.push(current.items);
    } else {
      current.items.push(action);
    }
  }
  return groups;
}

/** Clamp a cursor point so the menu stays inside the viewport. */
function clampPoint(x: number, y: number, height: number): { top: number; left: number } {
  const vw = globalThis.innerWidth ?? 0;
  const vh = globalThis.innerHeight ?? 0;
  const left = Math.min(x, Math.max(MENU_MARGIN, vw - MENU_WIDTH - MENU_MARGIN));
  const top = Math.min(y, Math.max(MENU_MARGIN, vh - height - MENU_MARGIN));
  return { top, left };
}

/**
 * Right-click context menu for a sidebar page row. Positioned at the cursor,
 * renders the registry's actions (filtered file vs dir) into sections with
 * keyboard nav, submenu expansion, click-outside, and Escape close.
 */
export const PageContextMenu: React.FC<Props> = ({ x, y, ctx, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const portalTarget = globalThis.document?.body ?? null;

  const actions = actionsForTarget(ctx);
  const groups = groupBySection(actions);

  useClickOutside(menuRef, onClose, true);

  // Position after mount so we know the real height for bottom-edge clamping.
  // Defer the measure+setState out of the effect body (avoids cascading renders).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const h = menuRef.current?.getBoundingClientRect().height ?? 0;
      setPos(clampPoint(x, y, h));
    });
    return () => cancelAnimationFrame(raf);
  }, [x, y]);

  // Focus the menu once it's positioned so the first item is active and the
  // Arrow keys work immediately (no extra click needed).
  const focusedRef = useRef(false);
  useEffect(() => {
    if (pos && !focusedRef.current) {
      focusedRef.current = true;
      menuRef.current?.focus({ preventScroll: true });
    }
  }, [pos]);

  // Keep the highlighted item in view when arrowing through an overflowing menu.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-action-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function runAction(action: PageMenuAction) {
    if (action.enabled && !action.enabled(ctx)) return;
    if (action.submenu?.length) {
      setOpenSubmenu((id) => (id === action.id ? null : action.id));
      return;
    }
    onClose();
    void action.run(ctx);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % actions.length); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + actions.length) % actions.length); return; }
    if (e.key === "Enter") { e.preventDefault(); const a = actions[activeIndex]; if (a) runAction(a); }
  }

  function renderItem(action: PageMenuAction) {
    const flatIndex = actions.indexOf(action);
    const disabled = action.enabled ? !action.enabled(ctx) : false;
    const Icon = action.icon;
    const hasSubmenu = !!action.submenu?.length;
    const isSubOpen = openSubmenu === action.id;
    return (
      <React.Fragment key={action.id}>
        <button
          type="button"
          role="menuitem"
          data-action-index={flatIndex}
          disabled={disabled}
          aria-haspopup={hasSubmenu || undefined}
          aria-expanded={hasSubmenu ? isSubOpen : undefined}
          className={styles.menuItem}
          style={{
            opacity: disabled ? 0.45 : undefined,
            background: flatIndex === activeIndex ? "var(--osio-bg-hover)" : undefined,
          }}
          onMouseEnter={() => setActiveIndex(flatIndex)}
          onClick={(e) => { e.stopPropagation(); runAction(action); }}
        >
          {Icon ? <Icon size={14} className="shrink-0" /> : <span className="w-[14px] shrink-0" />}
          <span className="flex-1 text-left">{action.label}</span>
          {hasSubmenu ? <ChevronRight size={13} className="shrink-0 opacity-60" /> : null}
        </button>
        {hasSubmenu && isSubOpen
          ? action.submenu!.map((sub) => (
              <button
                key={sub.id}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                style={{ paddingLeft: 28 }}
                onClick={(e) => { e.stopPropagation(); onClose(); void sub.run(ctx); }}
              >
                {sub.icon ? <sub.icon size={14} className="shrink-0" /> : <span className="w-[14px] shrink-0" />}
                <span className="flex-1 text-left">{sub.label}</span>
              </button>
            ))
          : null}
      </React.Fragment>
    );
  }

  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className={styles.dropdown}
      style={{
        position: "fixed",
        top: pos?.top ?? y,
        left: pos?.left ?? x,
        right: "auto",
        width: MENU_WIDTH,
        // Cap to the viewport and scroll when the menu is taller than it fits
        // (e.g. heavy browser zoom) so every action stays reachable.
        maxHeight: `calc(100vh - ${MENU_MARGIN * 2}px)`,
        overflowY: "auto",
        overscrollBehavior: "contain",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {groups.map((group, gi) => (
        <div key={group[0]?.id ?? gi}>
          {gi > 0 ? <div className="my-1 h-px bg-[var(--osio-border-default)]" /> : null}
          {group.map(renderItem)}
        </div>
      ))}
    </div>,
    portalTarget,
  );
};
