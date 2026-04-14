/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaBlocks.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/14 00:00:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/14 00:00:00 by rstancu         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "./types";

export const MEDIA_BLOCK_TYPES = ["image", "video", "audio", "file"] as const;

export type MediaBlockType = (typeof MEDIA_BLOCK_TYPES)[number];

export const MEDIA_BLOCK_LABELS: Record<MediaBlockType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
};

export function isMediaBlockType(type: BlockType): type is MediaBlockType {
  return MEDIA_BLOCK_TYPES.includes(type as MediaBlockType);
}

export function createMediaBlock(type: MediaBlockType, asset: string): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content: "",
    asset,
  };
}
