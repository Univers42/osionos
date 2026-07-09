/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuCatalog.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/09 20:57:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { MousePointerClick } from "lucide-react";
import {
  COLLECTION_SLASH_ITEMS,
  COLLECTION_SLASH_SECTION_LABELS,
  IconPage,
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
  equation: "LaTeX equation block",
  layout: "Grid layout canvas",
  column_list: "Side-by-side columns",
  column: "Column container",
  divider: "Horizontal divider",
  table_block: "Simple table",
  database_inline: "Inline database",
  database_full_page: "Full-page database",
};

const SLASH_ALIASES: Partial<Record<BlockType, string[]>> = {
  database_inline: ["database inline"],
  database_full_page: ["database full page"],
  layout: ["layout inline", "layout full page", "layout page"],
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
  "equation",
  "column_list",
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

const BASE_SLASH_COMMANDS: SlashCommand[] = COLLECTION_SLASH_ITEMS.filter(
  (item) => item.type !== "layout",
).map(
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
        aliases: SLASH_ALIASES[item.type as BlockType],
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
      aliases: SLASH_ALIASES[item.type],
      icon: item.icon,
      description,
      blockType: item.type,
      calloutIcon: item.calloutIcon,
    };
  },
);

/** The template-only placeholder command id; gated to template pages by the menu. */
export const PLACEHOLDER_COMMAND_ID = "advanced:placeholder";

const LOCAL_SLASH_COMMANDS: SlashCommand[] = [
  {
    // Emoji: dispatched by id in the editor to OPEN the emoji picker at the caret
    // (see BlockEditorSurface). insertText is the no-op fallback for other hosts.
    id: "inline:emoji",
    kind: "inline",
    section: "basic",
    label: "Emoji",
    aliases: ["emoji", "emoticon", "smiley"],
    icon: "😊",
    description: "Insert an emoji (or type ':' then a name)",
    insertText: "",
  },
  {
    // Color: dispatched by id in the editor to OPEN a color picker; the pick
    // colors the text typed next. insertText is the no-op fallback.
    id: "inline:color",
    kind: "inline",
    section: "basic",
    label: "Text color",
    aliases: ["color", "colour", "text color", "highlight"],
    icon: "🎨",
    description: "Set the color of the text you type next",
    insertText: "",
  },
  {
    // Editor: inserts a blue placeholder link `[Link](https://)`. Dispatched by id
    // in the chat composer (onSlashSelect) as a link-preview card instead.
    id: "media:url",
    kind: "inline",
    section: "media",
    label: "Link / URL",
    aliases: ["url", "link", "embed link", "link preview"],
    icon: "🔗",
    description: "Insert a link with placeholder text",
    insertText: "[Link](https://)",
  },
  {
    id: "advanced:equation-inline",
    kind: "inline",
    section: "advanced",
    label: "Equation inline",
    icon: "∑",
    description: "Insert an inline LaTeX equation",
    insertText: "$E = mc^2$ ",
  },
  {
    id: "advanced:equation",
    kind: "block",
    section: "advanced",
    label: "Block equation",
    icon: "∑",
    description: "Write a display equation with LaTeX",
    blockType: "equation",
  },
  {
    // Template-only: gated to template pages in SlashCommandMenu.
    id: PLACEHOLDER_COMMAND_ID,
    kind: "block",
    section: "advanced",
    label: "Placeholder",
    aliases: ["placeholder", "fill", "blank", "field"],
    icon: "▢",
    description: "A fillable placeholder for pages made from this template",
    blockType: "placeholder",
  },
  {
    id: "layout:layout_inline",
    kind: "block",
    section: "layout",
    label: "Layout inline",
    aliases: ["layout", "layout inline", "inline layout", "same page layout"],
    icon: "▦",
    description: "Design an inline grid canvas",
    blockType: "layout",
    layoutMode: "inline",
  },
  {
    id: "layout:layout_full_page",
    kind: "block",
    section: "layout",
    label: "Layout full page",
    aliases: ["layout full page", "full page layout", "layout page"],
    icon: "▦",
    description: "Create a full-page layout canvas",
    blockType: "layout",
    layoutMode: "full_page",
  },
  {
    id: "layout:column_list",
    kind: "block",
    section: "layout",
    label: "2 columns",
    icon: "▥",
    description: "Create two side-by-side columns",
    blockType: "column_list",
  },
  {
    id: "basic:button",
    kind: "block",
    section: "basic",
    label: "Button",
    aliases: ["button", "cta", "link button", "action"],
    icon: <MousePointerClick size={16} />,
    description: "A clickable call-to-action button",
    blockType: "button",
  },
];

// ponytail: the slash menu inserts only generic EMPTY database blocks
// (database_inline / database_full_page, in BASE_SLASH_COMMANDS). Views bound to
// existing databases used to be listed here (kind "database-view") — dropped so
// the menu never proposes fetching a specific known database. The database-view
// select path in useSlashSelect stays but is now unreachable from the menu.

export const TURN_INTO_COMMANDS: SlashTurnIntoCommand[] =
  [
    ...COLLECTION_SLASH_ITEMS.filter(
      (item) => item.section === "basic" && TURN_INTO_BLOCK_TYPES.has(item.type),
    ).map((item): SlashTurnIntoCommand => {
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
    }),
    {
      id: "turn-into:equation",
      kind: "turn-into",
      section: "turn-into",
      label: "Block equation",
      icon: "∑",
      description: "Transform the current line into a LaTeX equation",
      blockType: "equation",
      placeholderText: "Equation",
    },
    {
      id: "turn-into:column_list",
      kind: "turn-into",
      section: "turn-into",
      label: "2 columns",
      icon: "▥",
      description: "Transform the current block into two columns",
      blockType: "column_list",
      placeholderText: "Columns",
    },
  ];

const CREATE_PAGE_COMMAND: SlashCreatePageCommand[] = [
  {
    id: "basic:create-page",
    kind: "create-page",
    section: "basic",
    label: "Page",
    icon: <IconPage />,
    description: "Create a new page and link it from here",
  },
];

export const SLASH_COMMANDS: SlashCommand[] = [
  ...CREATE_PAGE_COMMAND,
  ...BASE_SLASH_COMMANDS,
  ...LOCAL_SLASH_COMMANDS,
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
      item.aliases?.some((alias) => alias.toLowerCase().includes(lower)) ||
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
