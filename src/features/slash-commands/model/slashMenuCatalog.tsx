/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuCatalog.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/14 20:34:54 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  COLLECTION_SLASH_ITEMS,
  COLLECTION_SLASH_SECTION_LABELS,
} from "@/shared/lib/markengine/uiCollectionAssets";
import type { BlockType, MediaBlockType } from "@/entities/block";
import type { SlashCommand, SlashCommandSection } from "./types";

const SLASH_DESCRIPTIONS: Partial<Record<BlockType, string>> = {
  paragraph: "Plain text block",
  heading_1: "Large heading",
  heading_2: "Medium heading",
  heading_3: "Small heading",
  heading_4: "Section heading",
  heading_5: "Compact heading",
  heading_6: "Micro heading",
  bulleted_list: "Bulleted list item",
  numbered_list: "Numbered list item",
  to_do: "Checkbox item",
  toggle: "Collapsible content",
  image: "Insert an image from the library",
  video: "Insert a video from the library",
  audio: "Insert an audio asset from the library",
  file: "Insert a file from the library",
  code: "Code block",
  quote: "Block quote",
  callout: "Callout block",
  divider: "Horizontal divider",
  table_block: "Simple table",
  database_inline: "Inline database",
  database_full_page: "Full-page database",
};

const MEDIA_PICKER_TYPES = new Set<MediaBlockType>([
  "image",
  "video",
  "audio",
  "file",
]);

export const SLASH_COMMANDS: SlashCommand[] = COLLECTION_SLASH_ITEMS.map(
  (item) => {
    const description =
      SLASH_DESCRIPTIONS[item.type] ??
      item.keywords?.slice(0, 3).join(" · ") ??
      "Block option";

    if (MEDIA_PICKER_TYPES.has(item.type as MediaBlockType)) {
      return {
        id: `${item.section}:${item.type}`,
        kind: "media-picker",
        section: item.section,
        label: item.label,
        icon: item.icon,
        description,
        mediaKind: item.type as MediaBlockType,
      };
    }

    return {
      id: `${item.section}:${item.type}:${item.label}`,
      kind: "block",
      section: item.section,
      label: item.label,
      icon: item.icon,
      description,
      blockType: item.type,
      calloutIcon: item.calloutIcon,
    };
  },
);

export function filterSlashCommands(filter: string): SlashCommand[] {
  if (!filter) {
    return SLASH_COMMANDS;
  }

  const lower = filter.toLowerCase();
  return SLASH_COMMANDS.filter((item) => {
    return (
      item.label.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      ("blockType" in item && item.blockType.toLowerCase().includes(lower)) ||
      item.id.toLowerCase().includes(lower)
    );
  });
}

export function groupSlashCommands(commands: SlashCommand[]): SlashCommandSection[] {
  const bySection = new Map<string, SlashCommand[]>();

  for (const command of commands) {
    const items = bySection.get(command.section) ?? [];
    items.push(command);
    bySection.set(command.section, items);
  }

  return Array.from(bySection.entries()).map(([id, items]) => ({
    id,
    label: COLLECTION_SLASH_SECTION_LABELS[id] ?? id,
    items,
  }));
}
