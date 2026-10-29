/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rawSave.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { sanitizeLinkBlockFields } from "@/entities/block/model/linkBlocks";
import { parseMarkdownToBlocks } from "@osionos/markdown-engine/blocks";
import { applyOverlay, collectOverlay } from "@/features/page-file/model/blockOverlay";

/**
 * Rebuild a page's block tree from raw Markdown while preserving the ids and
 * the fields Markdown cannot carry (textColor, collapsed, recordRef, ...).
 *
 * Raw mode used to replace the page with freshly parsed Markdown, which minted
 * new ids and dropped every extra field. The `.omd` page file already solved
 * the same problem via collectOverlay/applyOverlay: record each block's id and
 * extras by pre-order path, then re-apply them where the block type still
 * matches. Raw-mode save does the same thing against the page's current blocks.
 *
 * Caveat: matching is by pre-order position and type, so an edit that inserts a
 * block above a coloured one moves the colour off it. The same limit holds for
 * the page file.
 */
export function rawSourceToBlocks(source: string, current: readonly Block[]): Block[] {
  return applyOverlay(sanitizeLinkBlockFields(parseMarkdownToBlocks(source)), collectOverlay(current));
}