/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   turnIntoOptions.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Megaphone,
  Quote,
  Sigma,
  SquareCheck,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { BlockType } from "@/entities/block";

/**
 * The block types the selection toolbar can turn a line into.
 *
 * Only types the editor can convert to: every one is a `BlockType` and a
 * turn-into entry of the slash menu. Page and toggle-heading are absent because
 * neither exists as a BlockType (a page is created, not converted to), and the
 * preview type is explicit so BlockTypePreview can be reused by the slash menu.
 */
export interface TurnIntoOption {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  previewType: BlockType;
}

export const TURN_INTO_OPTIONS: readonly TurnIntoOption[] = [
  { type: "paragraph", label: "Text", icon: Type, previewType: "paragraph" },
  { type: "heading_1", label: "Heading 1", icon: Heading1, previewType: "heading_1" },
  { type: "heading_2", label: "Heading 2", icon: Heading2, previewType: "heading_2" },
  { type: "heading_3", label: "Heading 3", icon: Heading3, previewType: "heading_3" },
  { type: "heading_4", label: "Heading 4", icon: Heading4, previewType: "heading_4" },
  { type: "bulleted_list", label: "Bulleted list", icon: List, previewType: "bulleted_list" },
  { type: "numbered_list", label: "Numbered list", icon: ListOrdered, previewType: "numbered_list" },
  { type: "to_do", label: "To-do list", icon: SquareCheck, previewType: "to_do" },
  { type: "toggle", label: "Toggle list", icon: ChevronRight, previewType: "toggle" },
  { type: "code", label: "Code", icon: Code, previewType: "code" },
  { type: "quote", label: "Quote", icon: Quote, previewType: "quote" },
  { type: "callout", label: "Callout", icon: Megaphone, previewType: "callout" },
  { type: "equation", label: "Block equation", icon: Sigma, previewType: "equation" },
];

export const TURN_INTO_LABEL_BY_TYPE = new Map(
  TURN_INTO_OPTIONS.map((option) => [option.type, option.label]),
);

export function turnIntoLabel(blockType?: string): string {
  return (blockType && TURN_INTO_LABEL_BY_TYPE.get(blockType as BlockType)) || "Text";
}
