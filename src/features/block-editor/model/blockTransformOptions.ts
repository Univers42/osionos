/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockTransformOptions.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The "Turn into" menu entries. Apart from the block-tree helpers because building them reads
// ui-collection's slash catalog and its two icon modules (~25 KB): the automation commands that
// import those helpers sit on the boot path, the context menu does not.

import type { ReactNode } from "react";
import type { BlockType } from "@/entities/block";
import { COLLECTION_SLASH_ITEMS } from "@/shared/ui/assets/collectionSlashItems";

export interface BlockTransformOption {
  type: BlockType;
  label: string;
  icon: ReactNode;
}

const CONTEXT_MENU_TRANSFORM_TYPES = new Set<BlockType>([
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
  "quote",
  "code",
  "callout",
  "equation",
  "layout",
  "column_list",
  "divider",
]);

export const BLOCK_TRANSFORM_OPTIONS: readonly BlockTransformOption[] =
  [
    ...COLLECTION_SLASH_ITEMS.filter((item) =>
      CONTEXT_MENU_TRANSFORM_TYPES.has(item.type),
    ).map((item) => ({
      type: item.type,
      label: item.label,
      icon: item.icon,
    })),
    { type: "equation" as BlockType, label: "Block equation", icon: "∑" },
    { type: "layout" as BlockType, label: "Layout", icon: "▦" },
    { type: "column_list" as BlockType, label: "2 columns", icon: "▥" },
  ];
