import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

import { breakoutStyles, resizeLimits, resizedBox, widthPercentOf, type BoxSize, type ResizeEdge, type ResizeLimits } from "./blockResize";
import { toCssPx } from "./cssZoom";
import { measureBreakout } from "./useBreakoutLayout";

export interface BlockResizeCommit {
  /** Set when the drag moved a side: the new share of the column, as `mediaWidth` stores it. */
  widthPercent?: number;
  /** Set when the drag moved the top or bottom: the new height in px. */
  height?: number;
}

export interface BlockResizeOptions {
  frameRef: RefObject<HTMLElement | null>;
  /** The frame's parent: its own parent is the text column the width is a share of. */
  bandRef: RefObject<HTMLElement | null>;
  /** Floor in px; gives way to a narrower column. */
  minWidth: number;
  /** Whether the block may grow past its column into the pane (an image may not). */
  breaksOut: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** The element inside the frame that owns the height; the frame itself when unset.
   *  Not found at pointer-down (e.g. an embed still showing its card) = width only. */
  heightTarget?: string;
  /** Called ONCE on release, only for the axes the pointer moved. */
  onCommit: (commit: BlockResizeCommit) => void;
}

interface Drag {
  edge: ResizeEdge;
  startX: number;
  startY: number;
  start: BoxSize;
  column: number;
  available: number;
  limits: ResizeLimits;
  heightEl: HTMLElement | null;
  latest: BoxSize | null;
}

// Every frame style a drag may write: release clears them all, then writes the settled style.
const DRAGGED_STYLE = { width: "", maxWidth: "", marginInline: "", marginLeft: "", marginRight: "" };

function marginWhileDragging(width: number, drag: Pick<Drag, "column" | "available" | "start">): string {
  if (drag.start.width > drag.available) return "0px";
  return width > drag.column ? `${(drag.column - width) / 2}px` : "auto";
}

function resolveHeightEl(frame: HTMLElement, selector: string | undefined): HTMLElement | null {
  return selector === undefined ? frame : frame.querySelector<HTMLElement>(selector);
}

/** The drag of a centred block's eight grips. A drag writes the frame's style directly and
 *  commits once on release; committing per move would run the page-save pipeline at pointer
 *  rate. `isDragging` lets the caller freeze iframes, which would swallow the pointer.
 *  Caveat: the column is the band's parent's content box, measured once at pointer-down; a
 *  column that changes width mid-drag (a sidebar animating) stores a share of the old one. */
export function useBlockResize({ frameRef, bandRef, minWidth, breaksOut, minHeight = 0, maxHeight, heightTarget, onCommit }: BlockResizeOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<Drag | null>(null);

  const begin = useCallback(
    (edge: ResizeEdge, event: PointerEvent<HTMLElement>) => {
      const frame = frameRef.current;
      const band = bandRef.current;
      if (!frame || !band) return;
      const measured = measureBreakout(band);
      const { column } = measured;
      if (column <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const available = breaksOut ? measured.available : column;
      const heightEl = resolveHeightEl(frame, heightTarget);
      const start = { width: frame.offsetWidth, height: heightEl?.offsetHeight ?? 0 };
      dragRef.current = {
        edge,
        startX: event.clientX,
        startY: event.clientY,
        start,
        column,
        available,
        limits: resizeLimits({ column, available, current: start.width, minWidth, minHeight, maxHeight }),
        heightEl,
        latest: null,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [frameRef, bandRef, breaksOut, heightTarget, minWidth, minHeight, maxHeight],
  );

  const move = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      const frame = frameRef.current;
      if (!drag || !frame) return;
      const delta = { x: toCssPx(event.clientX - drag.startX, frame), y: toCssPx(event.clientY - drag.startY, frame) };
      const next = resizedBox(drag.start, drag.edge, { x: delta.x, y: drag.heightEl ? delta.y : 0 }, drag.limits);
      drag.latest = next;
      if (next.width !== drag.start.width) {
        // Centred on the column: past it, equal negative margins push both sides out alike. A
        // block already wider than the pane scrolls in its band, from the band's left edge.
        const margin = marginWhileDragging(next.width, drag);
        Object.assign(frame.style, DRAGGED_STYLE, { width: `${next.width}px`, maxWidth: "none", marginLeft: margin, marginRight: margin });
      }
      if (drag.heightEl && next.height !== drag.start.height) drag.heightEl.style.height = `${next.height}px`;
    },
    [frameRef],
  );

  const end = useCallback(() => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    const band = bandRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag?.latest || !frame || !band) return;
    const commit: BlockResizeCommit = {};
    if (drag.latest.width !== drag.start.width) {
      commit.widthPercent = widthPercentOf(drag.latest.width, drag.column);
      // The render that follows writes the same values: React skips an unchanged style, so the
      // px the drag left behind would otherwise outlive a later column change.
      const settled = breakoutStyles({ percent: commit.widthPercent, minWidth, column: drag.column, available: drag.available });
      Object.assign(frame.style, DRAGGED_STYLE, settled.frame);
    }
    if (drag.heightEl && drag.latest.height !== drag.start.height) commit.height = drag.latest.height;
    if (commit.widthPercent !== undefined || commit.height !== undefined) onCommit(commit);
  }, [frameRef, bandRef, minWidth, onCommit]);

  const handleProps = useCallback(
    (edge: ResizeEdge) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => begin(edge, event),
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
    }),
    [begin, move, end],
  );

  return { isDragging, handleProps };
}
