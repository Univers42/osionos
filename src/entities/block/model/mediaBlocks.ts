/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaBlocks.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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

/**
 * Is this block's image one the AI made?
 *
 * The label only shows for a block that carries a complete provenance (the
 * model, the run and the date). A half-written one — a block hand-edited, or
 * one from an older version — is a normal image.
 */
export function isAiGenerated(block: Block): boolean {
  const provenance: unknown = block.aiGenerated;
  if (typeof provenance !== "object" || provenance === null) return false;
  const candidate = provenance as { model?: unknown; runId?: unknown; createdAt?: unknown };
  return (
    typeof candidate.model === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.createdAt === "string"
  );
}
