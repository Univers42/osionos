/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menuKeys.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Where keyboard focus is inside the menubar when a key arrives. */
export type MenuKeyState =
  | { focus: "trigger"; index: number; count: number; open: boolean }
  | {
    focus: "row";
    /** 0 for a row of the top menu, 1 for a row of an open submenu. */
    level: 0 | 1;
    index: number;
    labels: readonly string[];
    /** True when the focused row opens a submenu. */
    submenu: boolean;
    /** The open top menu, and how many top menus there are. */
    trigger: number;
    count: number;
  };

/** What the menubar does about a key; the DOM-side hook carries it out. */
export type MenuKeyAction =
  | { type: "none" }
  | { type: "focusTrigger"; index: number }
  | { type: "openMenu"; index: number; row: "first" | "last" | "none" }
  | { type: "focusRow"; index: number }
  | { type: "openSub" }
  | { type: "closeSub" }
  | { type: "close"; focus: "trigger" | "none" }
  | { type: "activate" };

const NONE: MenuKeyAction = { type: "none" };

function ringStep(index: number, count: number, step: 1 | -1): number {
  return (index + step + count) % count;
}

function resolveTriggerKey(key: string, state: Extract<MenuKeyState, { focus: "trigger" }>): MenuKeyAction {
  const { index, count, open } = state;
  switch (key) {
    case "ArrowRight":
    case "ArrowLeft": {
      const next = ringStep(index, count, key === "ArrowRight" ? 1 : -1);
      return open ? { type: "openMenu", index: next, row: "none" } : { type: "focusTrigger", index: next };
    }
    case "Enter":
    case " ":
    case "ArrowDown":
      return { type: "openMenu", index, row: "first" };
    case "ArrowUp":
      return { type: "openMenu", index, row: "last" };
    case "Escape":
      return open ? { type: "close", focus: "trigger" } : NONE;
    case "Tab":
      return open ? { type: "close", focus: "none" } : NONE;
    default:
      return NONE;
  }
}

/** The row after `from` whose label starts with `char`, wrapping and ending on `from` itself. */
function typeahead(char: string, labels: readonly string[], from: number): MenuKeyAction {
  const wanted = char.toLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (from + step) % labels.length;
    if (labels[index].toLowerCase().startsWith(wanted)) return { type: "focusRow", index };
  }
  return NONE;
}

function resolveRowKey(key: string, state: Extract<MenuKeyState, { focus: "row" }>): MenuKeyAction {
  const { index, labels, level, submenu, trigger, count } = state;
  if (labels.length === 0) return NONE;
  switch (key) {
    case "ArrowDown": return { type: "focusRow", index: ringStep(index, labels.length, 1) };
    case "ArrowUp": return { type: "focusRow", index: ringStep(index, labels.length, -1) };
    case "Home": return { type: "focusRow", index: 0 };
    case "End": return { type: "focusRow", index: labels.length - 1 };
    case "Enter":
    case " ": return { type: "activate" };
    case "ArrowRight":
      if (submenu && level === 0) return { type: "openSub" };
      return { type: "openMenu", index: ringStep(trigger, count, 1), row: "first" };
    case "ArrowLeft":
      if (level === 1) return { type: "closeSub" };
      return { type: "openMenu", index: ringStep(trigger, count, -1), row: "first" };
    case "Escape": return level === 1 ? { type: "closeSub" } : { type: "close", focus: "trigger" };
    case "Tab": return { type: "close", focus: "none" };
    default: return key.length === 1 ? typeahead(key, labels, index) : NONE;
  }
}

/**
 * The menubar's keyboard table (WAI-ARIA menubar): what `key` does given where
 * focus is. Pure, so the whole table is testable without a DOM. Ponytail:
 * typeahead matches the first letter only — a typed word does not narrow.
 */
export function resolveMenuKey(key: string, state: MenuKeyState): MenuKeyAction {
  return state.focus === "trigger" ? resolveTriggerKey(key, state) : resolveRowKey(key, state);
}
