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
  run: () => void;
}

/**
 * Flatten the menubar into a de-duplicated command list for the '>' palette
 * mode, so a single source of truth (the menus) drives both surfaces.
 */
export function buildCommands(ctx: MenuContext): PaletteCommand[] {
  const seen = new Set<string>();
  return buildMenus(ctx)
    .flatMap((group) => group.items.map((item) => ({
      id: item.id,
      label: item.label,
      group: group.label,
      accelerator: item.accelerator,
      run: item.run,
    })))
    .filter((command) => {
      if (seen.has(command.label)) return false;
      seen.add(command.label);
      return true;
    });
}
