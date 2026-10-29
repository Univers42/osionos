/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkBlocks.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseEmbedSnapshot, type EmbedSnapshot } from "@/shared/lib/embed/embedInfo";

import type { Block } from "./types";

export const LINK_BLOCK_TYPES = ["embed", "bookmark"] as const;
export type LinkBlockType = (typeof LINK_BLOCK_TYPES)[number];

/** Virtualizer guesses: a framed embed (default frame + footer) and a bookmark card. */
export const EMBED_BLOCK_ESTIMATED_HEIGHT = 540;
export const BOOKMARK_BLOCK_ESTIMATED_HEIGHT = 120;

export function isLinkBlockType(type: string): type is LinkBlockType {
  return (LINK_BLOCK_TYPES as readonly string[]).includes(type);
}

/** A fresh embed/bookmark block. `content` is the URL the user gave, so a build that
 *  does not know these types still shows the link; `snapshot` is optional metadata. */
export function createLinkBlock(type: LinkBlockType, url: string, snapshot?: EmbedSnapshot): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content: url,
    ...(snapshot ? { embed: snapshot } : {}),
  };
}

/** A decoded tree with every `embed` snapshot re-validated and every `embedHeight` made
 *  a finite number: block JSON is writable by any collaborator, and the markdown fence
 *  spreads whatever it holds onto the block. A snapshot that fails (including one over
 *  the 64 KB cap) is dropped, leaving the URL in `content`. Returns the same array when
 *  nothing changed.
 *
 *  Caveat: `layoutCells[].blocks` are not walked; those render through the render-time
 *  guards (chooseEmbedView, LinkCard) only. */
export function sanitizeLinkBlockFields(blocks: Block[]): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    const clean = sanitizeOne(block);
    if (clean !== block) changed = true;
    return clean;
  });
  return changed ? next : blocks;
}

function sanitizeOne(block: Block): Block {
  const children = block.children === undefined ? undefined : sanitizeLinkBlockFields(block.children);
  const hasBadHeight = block.embedHeight !== undefined && !Number.isFinite(block.embedHeight);
  const embed = block.embed === undefined ? undefined : parseEmbedSnapshot(block.embed);
  const embedChanged = block.embed !== undefined && (embed === null || JSON.stringify(embed) !== JSON.stringify(block.embed));
  if (children === block.children && !hasBadHeight && !embedChanged) return block;
  const next: Block = { ...block };
  delete next.embed;
  delete next.embedHeight;
  if (children !== undefined) next.children = children;
  if (embed) next.embed = embed;
  if (block.embedHeight !== undefined && !hasBadHeight) next.embedHeight = block.embedHeight;
  return next;
}
