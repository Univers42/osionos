/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockVirtualization.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "@/entities/block";

export const ROOT_BLOCK_VIRTUALIZATION_THRESHOLD = 60;
export const ROOT_BLOCK_VIRTUALIZATION_OVERSCAN = 12;

export const BLOCK_HEIGHT_ESTIMATE_BY_TYPE: Record<BlockType, number> = {
  paragraph: 36,
  heading_1: 68,
  heading_2: 60,
  heading_3: 52,
  heading_4: 46,
  heading_5: 42,
  heading_6: 40,
  bulleted_list: 36,
  numbered_list: 36,
  to_do: 40,
  toggle: 48,
  image: 280,
  video: 280,
  audio: 96,
  file: 96,
  code: 156,
  quote: 56,
  callout: 72,
  equation: 72,
  layout: 360,
  column_list: 180,
  column: 120,
  divider: 24,
  table_block: 220,
  database_inline: 260,
  database_full_page: 560,
};

export interface RootBlockRenderMeta {
  block: Block;
  effectiveIndex: number;
}

export function createRootBlockRenderMeta(blocks: Block[]): RootBlockRenderMeta[] {
  let numberedIndex = 0;

  return blocks.map((block, index) => {
    if (block.type === "numbered_list") {
      numberedIndex += 1;
    } else {
      numberedIndex = 0;
    }

    return {
      block,
      effectiveIndex: block.type === "numbered_list" ? numberedIndex - 1 : index,
    };
  });
}

export function estimateBlockHeight(block: Block | undefined): number {
  if (!block) return BLOCK_HEIGHT_ESTIMATE_BY_TYPE.paragraph;
  const baseHeight = BLOCK_HEIGHT_ESTIMATE_BY_TYPE[block.type] ?? BLOCK_HEIGHT_ESTIMATE_BY_TYPE.paragraph;
  const childBonus = block.children?.length ? Math.min(180, block.children.length * 32) : 0;
  const contentLength = block.content?.length ?? 0;
  const lineBonus = Math.min(96, Math.floor(contentLength / 80) * 24);
  return baseHeight + childBonus + lineBonus;
}

export function estimateRootBlockSize(block: Block | undefined): number {
  return estimateBlockHeight(block);
}