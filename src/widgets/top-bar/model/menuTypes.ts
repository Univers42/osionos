/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menuTypes.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SettingsSectionId } from "@/features/settings/model/sections";

/**
 * One clickable row. `disabled` and `checked` are read when the dropdown
 * renders; a `checked` row is a checkbox row. Ponytail: both are read when a
 * menu opens, not live while it stays open — subscribe in the UI if a row must
 * flip under the pointer.
 */
export interface MenuAction {
  id: string;
  label: string;
  /** Display-only; set only for a chord that is bound globally today. */
  accelerator?: string;
  run: () => void;
  separatorAfter?: boolean;
  disabled?: () => boolean;
  checked?: () => boolean;
  /** The dropdown hands focus back to the editable it came from BEFORE `run` (native undo/redo act on the focused element). */
  refocusEditor?: boolean;
}

/** A row that opens a list of actions. One level only: children are actions. */
export interface MenuSubmenu {
  id: string;
  label: string;
  children: MenuAction[];
  separatorAfter?: boolean;
}

export type MenuItem = MenuAction | MenuSubmenu;

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

/** App-level callbacks the menubar needs that live in React state (not a store). */
export interface MenuContext {
  openSettings: (section?: SettingsSectionId) => void;
}

/** True for a row that opens children rather than running an action. */
export function isSubmenu(item: MenuItem): item is MenuSubmenu {
  return "children" in item;
}

/**
 * The actions of a menu in display order, each submenu replaced in place by its
 * children. The submenu's own separator moves to its last child, so the rule
 * that closed the group still closes it.
 */
export function flattenActions(items: MenuItem[]): MenuAction[] {
  return items.flatMap((item) => {
    if (!isSubmenu(item)) return [item];
    const last = item.children.length - 1;
    return item.children.map((child, index) => (
      index === last && item.separatorAfter ? { ...child, separatorAfter: true } : child
    ));
  });
}
