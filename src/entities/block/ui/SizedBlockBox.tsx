import React from "react";

import { BlockResizeFrame } from "@/shared/ui/molecules/BlockResizeFrame";

import { BLOCK_MIN_WIDTH } from "../model/blockSize";
import type { Block } from "../model/types";

/** The read-only face of a block the user resized in the editor: the same centred width (past
 *  the column when it is above 100 %), and a user height (tables, databases, code) as a scroll
 *  box. The editor's resize frame with no grips. */
export const SizedBlockBox: React.FC<{ block: Block; children: React.ReactNode }> = ({ block, children }) => {
  const heightStyle: React.CSSProperties | undefined = block.blockHeight === undefined ? undefined : { height: block.blockHeight, overflow: "auto" };
  return (
    <BlockResizeFrame label="block" widthPercent={block.mediaWidth} minWidth={BLOCK_MIN_WIDTH} style={heightStyle}>
      {children}
    </BlockResizeFrame>
  );
};
