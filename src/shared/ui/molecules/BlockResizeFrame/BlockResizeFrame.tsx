import React, { useRef } from "react";

import { breakoutStyles, type ResizeEdge } from "@/shared/lib/dom/blockResize";
import { useBlockResize, type BlockResizeCommit } from "@/shared/lib/dom/useBlockResize";
import { useBreakoutLayout } from "@/shared/lib/dom/useBreakoutLayout";

export interface BlockResizeFrameProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** What the grip resizes, for its accessible name: "Resize <label>". */
  label: string;
  /** The stored share of the column (`mediaWidth`); unset = the block's own width. Above 100
   *  the block breaks out of the column, centred on it, up to the pane. */
  widthPercent?: number;
  minWidth: number;
  /** False keeps the block inside its column (an image). */
  breaksOut?: boolean;
  /** Whether the top and bottom grips exist. */
  resizesHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** Selector of the height owner inside the frame; the frame itself when unset. */
  heightTarget?: string;
  /** Unset: a read-only face with the same box and no grips. */
  onCommit?: (commit: BlockResizeCommit) => void;
  children: React.ReactNode;
}

const NO_COMMIT = () => undefined;
const NO_EDGES: readonly ResizeEdge[] = [];

const SIDES: readonly ResizeEdge[] = ["left", "right"];
const ALL_EDGES: readonly ResizeEdge[] = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];

// Just outside the frame's edges: inside it, a grip sat on the block's own controls (a
// database's "View settings" at a phone width, a table's last-column grip). Drawn above the
// block, so the whole edge is the grip; a control of the block's that reaches past its edge
// (a table's Add column / Add row) sits beyond these 8 px. A block that clips
// (overflow:hidden) must clip on an inner element, or it hides its grips.
const EDGE_CLASS: Record<ResizeEdge, string> = {
  top: "inset-x-3 -top-2 h-2 cursor-ns-resize",
  bottom: "inset-x-3 -bottom-2 h-2 cursor-ns-resize",
  left: "inset-y-3 -left-2 w-2 cursor-ew-resize",
  right: "inset-y-3 -right-2 w-2 cursor-ew-resize",
  "top-left": "-left-2 -top-2 h-3 w-3 cursor-nwse-resize",
  "top-right": "-right-2 -top-2 h-3 w-3 cursor-nesw-resize",
  "bottom-left": "-bottom-2 -left-2 h-3 w-3 cursor-nesw-resize",
  "bottom-right": "-bottom-2 -right-2 h-3 w-3 cursor-nwse-resize",
};

const PILL_CLASS: Partial<Record<ResizeEdge, string>> = {
  top: "mx-auto mt-0.5 h-1 w-10",
  bottom: "mx-auto mt-0.5 h-1 w-10",
  left: "absolute left-0.5 top-1/2 h-10 w-1 -translate-y-1/2",
  right: "absolute left-0.5 top-1/2 h-10 w-1 -translate-y-1/2",
};

function gripEdges(isEditable: boolean, resizesHeight: boolean): readonly ResizeEdge[] {
  if (!isEditable) return NO_EDGES;
  return resizesHeight ? ALL_EDGES : SIDES;
}

/** A block centred in its column with grips on every edge and corner (sides only when the
 *  height is not the user's). Past 100 % it grows into both margins; wider than the pane, it
 *  keeps its width and scrolls in a band (`data-block-breakout`) instead of being clipped. One
 *  grip carries the accessible name; the others repeat it for the pointer. While dragging,
 *  `data-resizing` freezes every iframe inside, which would otherwise swallow the pointer. */
export const BlockResizeFrame: React.FC<BlockResizeFrameProps> = ({
  label, widthPercent, minWidth, breaksOut = true, resizesHeight = false, minHeight, maxHeight, heightTarget, onCommit,
  children, className, style, ...rest
}) => {
  const bandRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const percent = breaksOut || widthPercent === undefined ? widthPercent : Math.min(100, widthPercent);
  const layout = useBreakoutLayout(bandRef, percent !== undefined && percent > 100);
  const styles = breakoutStyles({ percent, minWidth, column: layout.column, available: layout.available });
  const { isDragging, handleProps } = useBlockResize({
    frameRef, bandRef, minWidth, breaksOut, minHeight, maxHeight, heightTarget, onCommit: onCommit ?? NO_COMMIT,
  });
  const edges = gripEdges(onCommit !== undefined, resizesHeight);
  const namedEdge: ResizeEdge = resizesHeight ? "bottom" : "right";

  return (
    <div ref={bandRef} data-block-breakout="" style={styles.band}>
      <div
        {...rest}
        ref={frameRef}
        data-block-resize-frame=""
        data-resizing={isDragging ? "" : undefined}
        className={`group/resize relative [&[data-resizing]_iframe]:pointer-events-none ${className ?? ""}`}
        style={{ ...style, ...styles.frame }}
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
            className={`absolute z-[calc(var(--osio-z-raised)+1)] touch-none opacity-0 transition-opacity group-hover/resize:opacity-100 ${isDragging ? "opacity-100" : ""} ${EDGE_CLASS[edge]}`}
          >
            {PILL_CLASS[edge] ? <div className={`rounded-full bg-[var(--osio-border-strong)] ${PILL_CLASS[edge]}`} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
};
