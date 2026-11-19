import React from "react";

import type { Block } from "@/entities/block";
import { getBlockSurfaceStyle } from "@/features/block-editor/model/blockColors";

import { styleAttributes } from "../model/blockStyle";
import { flattenColumns } from "../model/blockTreeUtils";
import { useLayoutModes } from "./layoutModes";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

interface ReadOnlyColumnListProps {
  block: Block;
  bulletDepth: number;
  numberedDepth: number;
}

// Same ratio floor as the editable renderer, and the same per-COLUMN surface
// style: columns stay independent.
function columnGrow(column: Block, columnCount: number): number {
  return typeof column.widthRatio === "number" && Number.isFinite(column.widthRatio)
    ? Math.max(0.08, column.widthRatio)
    : 1 / Math.max(columnCount, 1);
}

export const ReadOnlyColumnList: React.FC<ReadOnlyColumnListProps> = ({ block, bulletDepth, numberedDepth }) => {
  const layoutModes = useLayoutModes();
  const columns = flattenColumns(block.children ?? [], layoutModes);
  return (
    <div className="osio-columns my-2">
      <div className="osio-columns-row flex items-start gap-6" {...styleAttributes(block, layoutModes)}>
        {columns.map((column) => (
          <div
            key={column.id}
            className="min-w-0 rounded-md"
            style={{ flexGrow: columnGrow(column, columns.length), flexBasis: 0, ...getBlockSurfaceStyle(column) }}
            {...styleAttributes(column, layoutModes)}
          >
            {(column.children ?? []).map((child, childIndex) => (
              <ReadOnlyBlock key={child.id} block={child} index={childIndex} bulletDepth={bulletDepth} numberedDepth={numberedDepth} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
