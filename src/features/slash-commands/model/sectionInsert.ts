// Where a section chosen from the slash menu lands: in place of the block "/" was
// typed in when that block is left empty, else right after it. The caller commits
// the result as one content replacement, so the insert is one undo step.

import { findBlockInTree, insertBlockAfterInTree, removeBlocksFromTree, updateBlockInTree, type Block } from "@/entities/block";
import { cloneBlock } from "@/features/block-editor/model/blockContextMenu.helpers";

export interface PlacedSection {
  content: Block[];
  /** The section's blocks as placed, with their fresh ids. */
  placed: Block[];
}

/**
 * `content` with `section` placed at the trigger block. `triggerText` is the
 * trigger's text once the "/query" is taken out. Every placed block gets a fresh id,
 * so a section inserted twice never shares an id.
 */
export function placeSection(content: Block[], triggerId: string, triggerText: string, section: Block[]): PlacedSection {
  const fresh = section.map((block) => cloneBlock(block, true));
  const trigger = findBlockInTree(content, triggerId);
  if (!trigger) return { content: [...content, ...fresh], placed: fresh };
  let next = updateBlockInTree(content, triggerId, (block) => ({ ...block, content: triggerText }));
  for (const block of [...fresh].reverse()) next = insertBlockAfterInTree(next, triggerId, block);
  const isEmptyParagraph = trigger.type === "paragraph" && triggerText === "" && !trigger.children?.length;
  return { content: isEmptyParagraph ? removeBlocksFromTree(next, new Set([triggerId])) : next, placed: fresh };
}

/** The first block a caret can go in: the first leaf, depth first. */
export function firstLeafId(blocks: Block[]): string | null {
  const first = blocks[0];
  if (!first) return null;
  return first.children?.length ? firstLeafId(first.children) : first.id;
}
