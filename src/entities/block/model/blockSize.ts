import type { BlockResizeCommit } from "@/shared/lib/dom/useBlockResize";

import type { Block } from "./types";

/** The width floor, in px, of a resized whiteboard, embed, table or inline database; a
 *  narrower column wins. */
export const BLOCK_MIN_WIDTH = 240;
/** An image may go smaller: it keeps its aspect, so it never turns into a sliver. */
export const IMAGE_MIN_WIDTH = 80;
/** The height floor of a table or inline database the user resized. */
export const BLOCK_MIN_HEIGHT = 120;

/** The fields each resizable block keeps its height in. */
export type BlockHeightKey = "whiteboardHeight" | "embedHeight" | "blockHeight";

/** The block update a resize commits: the width always lands in `mediaWidth`, the height in
 *  the block's own field, and only the axes the drag moved are written. */
export function blockSizeUpdate(commit: BlockResizeCommit, heightKey?: BlockHeightKey): Partial<Block> {
  const update: Partial<Block> = {};
  if (commit.widthPercent !== undefined) update.mediaWidth = commit.widthPercent;
  if (heightKey !== undefined && commit.height !== undefined) update[heightKey] = commit.height;
  return update;
}

/** Whether a table or inline database still bleeds into the page gutter: only until the
 *  user gives it a width or a height, which the bleed would contradict. */
export function keepsWideBleed(block: Pick<Block, "mediaWidth" | "blockHeight">): boolean {
  return (block.mediaWidth === undefined || block.mediaWidth >= 100) && block.blockHeight === undefined;
}
