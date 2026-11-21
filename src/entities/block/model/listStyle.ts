/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   listStyle.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Lettered ordered lists (#328). One home for the `listStyle` attribute: the
// typing trigger, the marker, the run counter every renderer shares, and what
// Enter / Tab / Shift+Tab / turn-into do to it. A block without the attribute
// is a decimal list and renders exactly as before (absent = decimal).

import { continuesSameType } from "./blockCategories";
import { getNumberedMarker } from "./listMarkers";
import type { Block, BlockType } from "./types";

export type ListStyle = NonNullable<Block["listStyle"]>;

// The markers rotate by depth (listMarkers.getNumberedMarker); slot 1 is a. b. c.
const ALPHA_SLOT = 1;

/** The style a block renders with; only a numbered_list honours it, and only the known value. */
export function listStyleOf(block: Block): ListStyle | undefined {
  return block.type === "numbered_list" && block.listStyle === "lower-alpha" ? "lower-alpha" : undefined;
}

// The whole text must be exactly "a." on a paragraph: anything looser turns
// "e.g." / "i.e." / a sentence starting "a." into a list while the user types.
export function isAlphaListShortcut(type: BlockType, text: string): boolean {
  return type === "paragraph" && text === "a.";
}

/** The marker for the `index`-th (1-based) item of its run at `depth`. */
export function numberedMarker(block: Block, index: number, depth: number): string {
  return getNumberedMarker(index, listStyleOf(block) ? ALPHA_SLOT : depth);
}

// A lettered item's children continue the rotation after the slot it shows
// (i. then A.), whatever depth the lettered item itself sits at.
export function childNumberedDepth(block: Block, depth: number): number {
  if (listStyleOf(block)) return ALPHA_SLOT + 1;
  return block.type === "numbered_list" ? depth + 1 : depth;
}

/**
 * 1-based position of each block inside its numbered run, 0 for a block that
 * is not a numbered item. A non-numbered block or a style change starts a new
 * run, so a. b. then 1. 2. restart. O(n), one pass.
 */
export function numberedRunIndexes(blocks: readonly Block[]): number[] {
  const indexes: number[] = [];
  let count = 0;
  let previous: Block | undefined;
  for (const block of blocks) {
    const numbered = block.type === "numbered_list";
    const sameRun = numbered && previous?.type === "numbered_list" && listStyleOf(previous) === listStyleOf(block);
    count = numbered ? (sameRun ? count + 1 : 1) : 0;
    indexes.push(count);
    previous = block;
  }
  return indexes;
}

/**
 * The `index` prop each read-only sibling gets: a numbered item's 0-based run
 * position, any other block its own position (only numbered items read it).
 */
export function readOnlyListIndexes(blocks: readonly Block[]): number[] {
  return numberedRunIndexes(blocks).map((run, position) => (run > 0 ? run - 1 : position));
}

/** `block` without the attribute; the same object when it never had one. */
function withoutListStyle(block: Block): Block {
  if (!Object.hasOwn(block, "listStyle")) return block;
  const copy = { ...block };
  delete copy.listStyle;
  return copy;
}

// Turn-into: the style survives only while the block stays a numbered list, so a
// stray key left by an older writer on another type is never revived.
export function withBlockType(block: Block, type: BlockType): Block {
  const next = { ...block, type };
  return type === "numbered_list" && block.type === "numbered_list" ? next : withoutListStyle(next);
}

/** The block Enter creates after `block`: same list type and style, nothing else copied. */
export function continuationOf(block: Block, content = ""): Block {
  const type = continuesSameType(block.type) ? block.type : "paragraph";
  const next: Block = { id: crypto.randomUUID(), type, content };
  const style = listStyleOf(block);
  if (type === "numbered_list" && style) next.listStyle = style;
  return next;
}

// Tab nests the item: it drops its own style so the depth rotation names it.
export function indentedListItem(block: Block): Block {
  return withoutListStyle(block);
}

/** Shift+Tab: the item joins its old parent's run, so it takes that parent's style. */
export function outdentedListItem(block: Block, previousSibling: Block | undefined): Block {
  const style = previousSibling ? listStyleOf(previousSibling) : undefined;
  if (block.type !== "numbered_list" || !style) return withoutListStyle(block);
  return { ...block, listStyle: style };
}
