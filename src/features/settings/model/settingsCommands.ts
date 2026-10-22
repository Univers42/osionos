/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsCommands.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The '>' palette entries for settings, built from the ONE registry: a section
// and every one of its anchors become a command. A new section is reachable
// from the palette the day it is registered — there is no second list here, so
// there is nothing to keep in sync.
//
// An ANCHOR row leads with the anchor name: the palette truncates a long
// title, and "Settings: Notifications › In-app notifications" cut at 60% of
// the row leaves four anchors reading the same. The section rides in the
// subtitle, which is where the eye reads the context.

import type { PaletteCommand } from "@/widgets/top-bar/model/commands";

import { SETTINGS_SECTIONS } from "./sections";
import { openSettings } from "./settingsNav";

/** The palette group every settings command sits in. */
const GROUP = "Settings";

/** One command per section and per anchor, in registry order. */
export function settingsPaletteCommands(): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (const section of SETTINGS_SECTIONS) {
    commands.push({
      id: `settings.${section.id}`,
      label: `Settings: ${section.title}`,
      group: GROUP,
      keywords: [section.label],
      run: () => openSettings(section.id),
    });
    for (const anchor of section.anchors) {
      commands.push({
        id: `settings.${section.id}.${anchor.id}`,
        label: anchor.label,
        group: `${GROUP} › ${section.title}`,
        keywords: ["settings", section.title, ...anchor.keywords],
        run: () => openSettings(section.id, anchor.id),
      });
    }
  }
  return commands;
}
