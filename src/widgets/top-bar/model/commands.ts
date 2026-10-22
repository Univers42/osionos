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

import { buildMenus, type MenuContext } from "./menus";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  accelerator?: string;
  /** Extra words the '>' matcher also matches, ranked below the label. */
  keywords?: string[];
  run: () => void;
}

/**
 * Flatten the menubar into a de-duplicated command list for the '>' palette
 * mode, so a single source of truth (the menus) drives both surfaces.
 * `extra` holds commands that live outside the menubar — the settings entries
 * are loaded with the palette, not with the entry chunk.
 */
export function buildCommands(ctx: MenuContext, extra: PaletteCommand[] = []): PaletteCommand[] {
  // The menus list an item in two menus: the first one wins, by label.
  const seenLabels = new Set<string>();
  const menuCommands = buildMenus(ctx)
    .flatMap((group) => group.items.map((item) => ({
      id: item.id,
      label: item.label,
      group: group.label,
      accelerator: item.accelerator,
      run: item.run,
    })))
    .filter((command) => {
      if (seenLabels.has(command.label)) return false;
      seenLabels.add(command.label);
      return true;
    });
  // The extra commands join AFTER that de-duplication and are keyed by id: an
  // anchor whose label equals a menu item's label is a DIFFERENT row — the
  // subtitle tells them apart — and must not be dropped.
  const seenIds = new Set(menuCommands.map((command) => command.id));
  const extraCommands = extra.filter((command) => {
    if (seenIds.has(command.id)) return false;
    seenIds.add(command.id);
    return true;
  });
  return [...menuCommands, ...extraCommands];
}
