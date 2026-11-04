import React from "react";

import { blockWidthStyle } from "@/shared/lib/dom/blockResize";

import { BLOCK_MIN_WIDTH } from "../model/blockSize";
import type { Block } from "../model/types";

/** The read-only face of a block the user resized in the editor: the same centred width,
 *  and a user height (tables, inline databases) as a scroll box. */
export const SizedBlockBox: React.FC<{ block: Block; children: React.ReactNode }> = ({ block, children }) => {
  const heightStyle: React.CSSProperties = block.blockHeight === undefined ? {} : { height: block.blockHeight, overflow: "auto" };
  return <div style={{ ...blockWidthStyle(block.mediaWidth, BLOCK_MIN_WIDTH), ...heightStyle }}>{children}</div>;
};
