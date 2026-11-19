import React from "react";

import type { Block } from "@/entities/block";
import { getBlockSurfaceStyle } from "@/features/block-editor/model/blockColors";

import { flattenColumns } from "../model/blockTreeUtils";
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
  const columns = flattenColumns(block.children ?? []);
  return (
    <div className="osio-columns my-2">
      <div className="osio-columns-row flex items-start gap-6">
        {columns.map((column) => (
          <div
            key={column.id}
            className="min-w-0 rounded-md"
            style={{ flexGrow: columnGrow(column, columns.length), flexBasis: 0, ...getBlockSurfaceStyle(column) }}
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
