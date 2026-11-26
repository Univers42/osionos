/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menuDom.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { MenuKeyState } from "../model/menuKeys";

export const ROW_SELECTOR = '[role^="menuitem"]';
export const TRIGGER_SELECTOR = "[data-menu-trigger]";

/** The rows a menu panel owns itself, in order (a submenu's rows belong to the submenu). */
export function panelRows(panel: Element): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter((row) => row.closest('[role="menu"]') === panel);
}

/** The triggers of a menubar, in order. */
export function triggersOf(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)];
}

/** The open panel at `level` (0 = top menu, 1 = submenu), or null. */
export function panelAt(container: Element, level: 0 | 1): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[role="menu"][data-menu-level="${level}"]`);
}

/** Focus the first or last row of the panel at `level`; a no-op when it is not open. */
export function focusEdgeRow(container: Element, level: 0 | 1, edge: "first" | "last"): void {
  const panel = panelAt(container, level);
  const rows = panel ? panelRows(panel) : [];
  rows.at(edge === "first" ? 0 : -1)?.focus({ preventScroll: true });
}

function triggerState(container: Element, trigger: HTMLElement): MenuKeyState {
  const all = triggersOf(container);
  return { focus: "trigger", index: all.indexOf(trigger), count: all.length, open: trigger.getAttribute("aria-expanded") === "true" };
}

function rowState(container: Element, row: HTMLElement): MenuKeyState | null {
  const panel = row.closest<HTMLElement>('[role="menu"]');
  if (!panel) return null;
  const rows = panelRows(panel);
  const all = triggersOf(container);
  return {
    focus: "row",
    level: panel.dataset.menuLevel === "1" ? 1 : 0,
    index: rows.indexOf(row),
    labels: rows.map((one) => one.dataset.menuLabel ?? ""),
    submenu: row.getAttribute("aria-haspopup") === "menu",
    trigger: Math.max(0, all.findIndex((one) => one.getAttribute("aria-expanded") === "true")),
    count: all.length,
  };
}

/** Where focus is, as the pure key table wants it; null when `target` is neither a trigger nor a row of `container`. */
export function readKeyState(container: Element, target: EventTarget | null): MenuKeyState | null {
  if (!(target instanceof Element)) return null;
  const trigger = target.closest<HTMLElement>(TRIGGER_SELECTOR);
  if (trigger && container.contains(trigger)) return triggerState(container, trigger);
  const row = target.closest<HTMLElement>(ROW_SELECTOR);
  return row && container.contains(row) ? rowState(container, row) : null;
}

/** The rendered, tabbable controls of `root` in order (rows inside a closed disclosure are not rendered). */
export function tabStops(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("summary, button:not([disabled])")].filter((one) => one.checkVisibility());
}

/** Keeps Tab inside `root`: from the last stop it wraps to the first, from the first with Shift to the last. Returns true when it moved focus. */
export function wrapTab(root: Element, event: { key: string; shiftKey: boolean; preventDefault: () => void }): boolean {
  if (event.key !== "Tab") return false;
  const stops = tabStops(root);
  const edge = event.shiftKey ? stops.at(0) : stops.at(-1);
  if (!edge || document.activeElement !== edge) return false;
  event.preventDefault();
  (event.shiftKey ? stops.at(-1) : stops.at(0))?.focus();
  return true;
}
