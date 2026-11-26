/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   commands.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isSubmenu, type MenuAction, type MenuContext, type MenuGroup } from "./menuTypes";
import { buildMenus } from "./menus";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  accelerator?: string;
  /** Extra words the '>' matcher also matches, ranked below the label. */
  keywords?: string[];
  run: () => void;
}

function toCommand(action: MenuAction, group: string): PaletteCommand {
  return { id: action.id, label: action.label, group, accelerator: action.accelerator, run: action.run };
}

/**
 * The commands of one menu, a submenu's children listed under
 * "<menu> › <submenu>". Disabled rows stay: commands are built once, so every
 * `run` guards its own precondition and a disabled one is a safe no-op.
 */
function groupCommands(group: MenuGroup): PaletteCommand[] {
  return group.items.flatMap((item) => (
    isSubmenu(item)
      ? item.children.map((child) => toCommand(child, `${group.label} › ${item.label}`))
      : [toCommand(item, group.label)]
  ));
}

/**
 * Flatten the menubar into a de-duplicated command list for the '>' palette
 * mode, so a single source of truth (the menus) drives both surfaces. The menus
 * list an action in two places: the first one wins, by label.
 * `extra` holds commands that live outside the menubar — the settings entries
 * are loaded with the palette, not with the entry chunk. They join AFTER that
 * de-duplication and are keyed by id: an anchor whose label equals a menu
 * item's label is a DIFFERENT row — the subtitle tells them apart — and must
 * not be dropped.
 */
export function buildCommands(ctx: MenuContext, extra: PaletteCommand[] = []): PaletteCommand[] {
  const seenLabels = new Set<string>();
  const menuCommands = buildMenus(ctx).flatMap(groupCommands).filter((command) => {
    if (seenLabels.has(command.label)) return false;
    seenLabels.add(command.label);
    return true;
  });
  const seenIds = new Set(menuCommands.map((command) => command.id));
  const extraCommands = extra.filter((command) => {
    if (seenIds.has(command.id)) return false;
    seenIds.add(command.id);
    return true;
  });
  return [...menuCommands, ...extraCommands];
}
