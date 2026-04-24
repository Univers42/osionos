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
  COLLECTION_PAGE_SLASH_ITEM,
  COLLECTION_SLASH_ITEMS,
  COLLECTION_SLASH_SECTION_LABELS,
} from "@/shared/lib/markengine/uiCollectionAssets";
import type { BlockType, MediaBlockType } from "@/entities/block";
import type {
  SlashCreatePageCommand,
  SlashCommand,
  SlashCommandSection,
  SlashTurnIntoCommand,
} from "./types";

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

const TURN_INTO_BLOCK_TYPES = new Set<BlockType>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "heading_5",
  "heading_6",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "code",
  "quote",
  "callout",
]);

const EXTRA_SECTION_LABELS: Record<string, string> = {
  "turn-into": "Turn into",
};

const SECTION_ORDER = [
  "basic",
  "media",
  "turn-into",
  "database",
  "layout",
  "advanced",
] as const;

const BASE_SLASH_COMMANDS: SlashCommand[] = COLLECTION_SLASH_ITEMS.map(
  (item) => {
    const normalizedLabel = item.type === "callout" ? "Callout" : item.label;
    const description =
      SLASH_DESCRIPTIONS[item.type] ??
      item.keywords?.slice(0, 3).join(" · ") ??
      "Block option";

    if (MEDIA_PICKER_TYPES.has(item.type as MediaBlockType)) {
      return {
        id: `${item.section}:${item.type}`,
        kind: "media-picker",
        section: item.section,
        label: normalizedLabel,
        icon: item.icon,
        description,
        mediaKind: item.type as MediaBlockType,
      };
    }

    return {
      id: `${item.section}:${item.type}:${item.label}`,
      kind: "block",
      section: item.section,
      label: normalizedLabel,
      icon: item.icon,
      description,
      blockType: item.type,
      calloutIcon: item.calloutIcon,
    };
  },
);

export const TURN_INTO_COMMANDS: SlashTurnIntoCommand[] =
  COLLECTION_SLASH_ITEMS.filter(
    (item) => item.section === "basic" && TURN_INTO_BLOCK_TYPES.has(item.type),
  ).map((item) => {
    const normalizedLabel = item.type === "callout" ? "Callout" : item.label;

    return {
      id: `turn-into:${item.type}:${normalizedLabel}`,
      kind: "turn-into",
      section: "turn-into",
      label: normalizedLabel,
      icon: item.icon,
      description: `Transform the current line into ${normalizedLabel.toLowerCase()}`,
      blockType: item.type,
      calloutIcon: item.calloutIcon,
      placeholderText: normalizedLabel,
    };
  });

const CREATE_PAGE_COMMAND: SlashCreatePageCommand[] = COLLECTION_PAGE_SLASH_ITEM
  ? [
      {
        id: `${COLLECTION_PAGE_SLASH_ITEM.section}:${COLLECTION_PAGE_SLASH_ITEM.type}`,
        kind: "create-page",
        section: COLLECTION_PAGE_SLASH_ITEM.section,
        label: COLLECTION_PAGE_SLASH_ITEM.label,
        icon: COLLECTION_PAGE_SLASH_ITEM.icon,
        description: "Create a new page and link it from here",
      },
    ]
  : [];

export const SLASH_COMMANDS: SlashCommand[] = [
  ...CREATE_PAGE_COMMAND,
  ...BASE_SLASH_COMMANDS,
  ...TURN_INTO_COMMANDS,
];

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

export function groupSlashCommands(
  commands: SlashCommand[],
): SlashCommandSection[] {
  const bySection = new Map<string, SlashCommand[]>();

  for (const command of commands) {
    const items = bySection.get(command.section) ?? [];
    items.push(command);
    bySection.set(command.section, items);
  }

  const sections = Array.from(bySection.entries()).map(([id, items]) => ({
    id,
    label:
      COLLECTION_SLASH_SECTION_LABELS[id] ?? EXTRA_SECTION_LABELS[id] ?? id,
    items,
  }));

  return sections.sort((left, right) => {
    const leftIndex = SECTION_ORDER.indexOf(
      left.id as (typeof SECTION_ORDER)[number],
    );
    const rightIndex = SECTION_ORDER.indexOf(
      right.id as (typeof SECTION_ORDER)[number],
    );

    const normalizedLeft =
      leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight =
      rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    return (
      normalizedLeft - normalizedRight || left.label.localeCompare(right.label)
    );
  });
}
