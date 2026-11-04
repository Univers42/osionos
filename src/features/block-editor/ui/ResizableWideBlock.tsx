import React from "react";

import { BLOCK_MIN_HEIGHT, BLOCK_MIN_WIDTH, blockSizeUpdate, keepsWideBleed, type Block } from "@/entities/block";
import { BlockResizeFrame } from "@/shared/ui/molecules/BlockResizeFrame";

interface Props {
  block: Block;
  /** What the grip resizes: "Resize <label>". */
  label: string;
  /** Top-level page-body block: may bleed to the page edge while the user has not sized it. */
  wideBlock: boolean;
  onUpdateBlock: (updates: Partial<Block>) => void;
  children: (wide: boolean) => React.ReactNode;
}

/** A table or inline database in its resize frame. A user height turns the frame into a
 *  scroll box; until the user sizes it, it keeps the page-edge bleed (`osio-wide-block`). */
export const ResizableWideBlock: React.FC<Props> = ({ block, label, wideBlock, onUpdateBlock, children }) => {
  const wide = wideBlock && keepsWideBleed(block);
  const hasHeight = block.blockHeight !== undefined;
  return (
    <BlockResizeFrame
      label={label}
      widthPercent={block.mediaWidth}
      minWidth={BLOCK_MIN_WIDTH}
      resizesHeight
      minHeight={BLOCK_MIN_HEIGHT}
      onCommit={(commit) => onUpdateBlock(blockSizeUpdate(commit, "blockHeight"))}
      style={hasHeight ? { height: block.blockHeight } : undefined}
    >
      <div className={hasHeight ? "h-full overflow-auto" : undefined}>
        <div className={wide ? "osio-wide-block" : "osio-block-scroll-x"}>{children(wide)}</div>
      </div>
    </BlockResizeFrame>
  );
};
