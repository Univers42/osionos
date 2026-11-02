// The block menu edits what it sits next to (#257): opened at the pointer it hid
// the block, so a colour change could not be seen as it applied.

export interface BlockEdges {
  left: number;
  right: number;
}

export interface MenuColumn {
  width: number;
  viewportWidth: number;
  margin: number;
}

const GAP_FROM_BLOCK = 8;

/** The menu's left edge: clear of the block on the right, else on the left. A block
 *  wider than the room on both sides gets the menu on the viewport edge with the
 *  most room, which covers the least of it. */
export function menuLeftBesideBlock(block: BlockEdges, menu: MenuColumn): number {
  const { width, viewportWidth, margin } = menu;
  const roomRight = viewportWidth - block.right - margin;
  const roomLeft = block.left - margin;
  if (roomRight >= width + GAP_FROM_BLOCK) return block.right + GAP_FROM_BLOCK;
  if (roomLeft >= width + GAP_FROM_BLOCK) return block.left - width - GAP_FROM_BLOCK;
  return roomRight >= roomLeft ? viewportWidth - width - margin : margin;
}
