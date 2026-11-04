import React, { useRef } from "react";

import { blockWidthStyle, type ResizeEdge } from "@/shared/lib/dom/blockResize";
import { useBlockResize, type BlockResizeCommit } from "@/shared/lib/dom/useBlockResize";

export interface BlockResizeFrameProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** What the grip resizes, for its accessible name: "Resize <label>". */
  label: string;
  /** The stored share of the column (`mediaWidth`); unset = the block's own width. */
  widthPercent?: number;
  minWidth: number;
  /** Whether the top and bottom grips exist. */
  resizesHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** Selector of the height owner inside the frame; the frame itself when unset. */
  heightTarget?: string;
  onCommit: (commit: BlockResizeCommit) => void;
  children: React.ReactNode;
}

const SIDES: readonly ResizeEdge[] = ["left", "right"];
const ALL_EDGES: readonly ResizeEdge[] = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];

// Inside the frame, never past it: a grip hanging over the edge would be clipped by a block
// with overflow:hidden and would push a narrow page into a horizontal scroll.
const EDGE_CLASS: Record<ResizeEdge, string> = {
  top: "inset-x-3 top-0 h-2 cursor-ns-resize",
  bottom: "inset-x-3 bottom-0 h-2 cursor-ns-resize",
  left: "inset-y-3 left-0 w-2 cursor-ew-resize",
  right: "inset-y-3 right-0 w-2 cursor-ew-resize",
  "top-left": "left-0 top-0 h-3 w-3 cursor-nwse-resize",
  "top-right": "right-0 top-0 h-3 w-3 cursor-nesw-resize",
  "bottom-left": "bottom-0 left-0 h-3 w-3 cursor-nesw-resize",
  "bottom-right": "bottom-0 right-0 h-3 w-3 cursor-nwse-resize",
};

const PILL_CLASS: Partial<Record<ResizeEdge, string>> = {
  top: "mx-auto mt-0.5 h-1 w-10",
  bottom: "mx-auto mt-0.5 h-1 w-10",
  left: "absolute left-0.5 top-1/2 h-10 w-1 -translate-y-1/2",
  right: "absolute left-0.5 top-1/2 h-10 w-1 -translate-y-1/2",
};

/** A block centred in its column with grips on every edge and corner (sides only when the
 *  height is not the user's). One grip carries the accessible name; the others repeat it for
 *  the pointer. While dragging, `data-resizing` freezes every iframe inside, which would
 *  otherwise swallow the pointer at its edge. */
export const BlockResizeFrame: React.FC<BlockResizeFrameProps> = ({
  label, widthPercent, minWidth, resizesHeight = false, minHeight, maxHeight, heightTarget, onCommit,
  children, className, style, ...rest
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const { isDragging, handleProps } = useBlockResize({ frameRef, minWidth, minHeight, maxHeight, heightTarget, onCommit });
  const edges = resizesHeight ? ALL_EDGES : SIDES;
  const namedEdge: ResizeEdge = resizesHeight ? "bottom" : "right";

  return (
    <div
      {...rest}
      ref={frameRef}
      data-block-resize-frame=""
      data-resizing={isDragging ? "" : undefined}
      className={`group/resize relative [&[data-resizing]_iframe]:pointer-events-none ${className ?? ""}`}
      style={{ ...style, ...blockWidthStyle(widthPercent, minWidth) }}
    >
      {children}
      {edges.map((edge) => (
        <div
          key={edge}
          data-resize-edge={edge}
          {...(edge === namedEdge
            ? { role: "separator", "aria-label": `Resize ${label}`, "aria-orientation": resizesHeight ? "horizontal" : "vertical" } as const
            : { "aria-hidden": true })}
          {...handleProps(edge)}
          className={`absolute z-[var(--osio-z-raised)] touch-none opacity-0 transition-opacity group-hover/resize:opacity-100 ${isDragging ? "opacity-100" : ""} ${EDGE_CLASS[edge]}`}
        >
          {PILL_CLASS[edge] ? <div className={`rounded-full bg-[var(--osio-border-strong)] ${PILL_CLASS[edge]}`} /> : null}
        </div>
      ))}
    </div>
  );
};
