/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMenuNavigation.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { resolveMenuKey, type MenuKeyAction } from "../model/menuKeys";
import { focusEdgeRow, panelAt, panelRows, readKeyState, ROW_SELECTOR, triggersOf } from "./menuDom";

interface PendingFocus {
  level: 0 | 1;
  edge: "first" | "last";
}

export interface MenuNavigation {
  openId: string | null;
  subId: string | null;
  /** Click on a trigger: open it, or close it when it is the open one. */
  toggle: (id: string) => void;
  /** Pointer over a trigger: switch to it and move focus there, but only while some menu is already open. */
  hover: (id: string) => void;
  setSub: (id: string | null) => void;
  close: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** Spread on the container: the document-level Escape binding yields to a menu that lists the key. */
  keyshortcuts: string | undefined;
}

/**
 * Open/submenu state plus the WAI-ARIA menubar keyboard for the triggers and
 * rows inside `containerRef`. Roving focus is real DOM focus. Escape stops at
 * the menu's own handler, and the automations dispatcher (a capture listener on
 * document) yields to it through `keyshortcuts`.
 */
export function useMenuNavigation(containerRef: RefObject<HTMLElement | null>, ids: readonly string[]): MenuNavigation {
  const [openId, setOpenId] = useState<string | null>(null);
  const [subId, setSub] = useState<string | null>(null);
  const [tick, bump] = useReducer((count: number) => count + 1, 0);
  const pending = useRef<PendingFocus | null>(null);

  const open = useCallback((id: string | null, focus: PendingFocus | null = null) => {
    pending.current = focus;
    setOpenId(id);
    setSub(null);
    bump();
  }, []);

  useLayoutEffect(() => {
    const want = pending.current;
    pending.current = null;
    if (want && containerRef.current) focusEdgeRow(containerRef.current, want.level, want.edge);
  }, [tick, containerRef]);

  useEffect(() => {
    if (!openId) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) open(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openId, open, containerRef]);

  const perform = useCallback((action: MenuKeyAction, event: KeyboardEvent<HTMLElement>): void => {
    const box = containerRef.current;
    if (!box) return;
    const triggers = triggersOf(box);
    switch (action.type) {
      case "focusTrigger": triggers[action.index]?.focus(); break;
      case "openMenu":
        open(ids[action.index], action.row === "none" ? null : { level: 0, edge: action.row });
        if (action.row === "none") triggers[action.index]?.focus();
        break;
      case "focusRow": {
        const panel = (event.target as Element).closest<HTMLElement>('[role="menu"]');
        (panel ? panelRows(panel) : [])[action.index]?.focus({ preventScroll: true });
        break;
      }
      case "openSub": {
        const row = (event.target as Element).closest<HTMLElement>(ROW_SELECTOR);
        pending.current = { level: 1, edge: "first" };
        setSub(row?.dataset.menuId ?? null);
        bump();
        break;
      }
      case "closeSub":
        panelRows(panelAt(box, 0) ?? box).find((row) => row.getAttribute("aria-expanded") === "true")?.focus({ preventScroll: true });
        setSub(null);
        break;
      case "close":
        if (action.focus === "trigger") triggers[ids.indexOf(openId ?? "")]?.focus();
        open(null);
        break;
      case "activate": (event.target as Element).closest<HTMLElement>(ROW_SELECTOR)?.click(); break;
      case "none": break;
    }
  }, [containerRef, ids, open, openId]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>): void => {
    const box = containerRef.current;
    if (!box || event.ctrlKey || event.metaKey || event.altKey) return;
    const state = readKeyState(box, event.target);
    if (!state) return;
    const action = resolveMenuKey(event.key, state);
    if (action.type === "none") return;
    if (!(action.type === "close" && action.focus === "none")) event.preventDefault();
    event.stopPropagation();
    perform(action, event);
  }, [containerRef, perform]);

  return {
    openId,
    subId,
    toggle: (id) => open(openId === id ? null : id),
    hover: (id) => {
      if (!openId || openId === id) return;
      open(id);
      triggersOf(containerRef.current ?? document.body)[ids.indexOf(id)]?.focus({ preventScroll: true });
    },
    setSub,
    close: () => open(null),
    onKeyDown,
    keyshortcuts: openId ? "Escape" : undefined,
  };
}
