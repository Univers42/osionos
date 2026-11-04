import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

import { blockWidthStyle, resizeLimits, resizedBox, widthPercentOf, type BoxSize, type ResizeEdge, type ResizeLimits } from "./blockResize";
import { toCssPx } from "./cssZoom";

export interface BlockResizeCommit {
  /** Set when the drag moved a side: the new share of the column, as `mediaWidth` stores it. */
  widthPercent?: number;
  /** Set when the drag moved the top or bottom: the new height in px. */
  height?: number;
}

export interface BlockResizeOptions {
  frameRef: RefObject<HTMLElement | null>;
  /** Floor in px; gives way to a narrower column. */
  minWidth: number;
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
  limits: ResizeLimits;
  heightEl: HTMLElement | null;
  latest: BoxSize | null;
}

function resolveHeightEl(frame: HTMLElement, selector: string | undefined): HTMLElement | null {
  return selector === undefined ? frame : frame.querySelector<HTMLElement>(selector);
}

/** The drag of a centred block's eight grips. A drag writes the frame's style directly and
 *  commits once on release; committing per move would run the page-save pipeline at pointer
 *  rate. `isDragging` lets the caller freeze iframes, which would swallow the pointer.
 *  Caveat: the column is the frame's parent `clientWidth`, which counts the parent's padding
 *  while a CSS percentage does not; a padded parent would store a share slightly too small.
 *  blockResize.spec.mjs holds a page-body table to 2 px across a reload. */
export function useBlockResize({ frameRef, minWidth, minHeight = 0, maxHeight, heightTarget, onCommit }: BlockResizeOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<Drag | null>(null);

  const begin = useCallback(
    (edge: ResizeEdge, event: PointerEvent<HTMLElement>) => {
      const frame = frameRef.current;
      const column = frame?.parentElement?.clientWidth ?? 0;
      if (!frame || column <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const heightEl = resolveHeightEl(frame, heightTarget);
      dragRef.current = {
        edge,
        startX: event.clientX,
        startY: event.clientY,
        start: { width: frame.offsetWidth, height: heightEl?.offsetHeight ?? 0 },
        column,
        limits: resizeLimits({ column, minWidth, minHeight, maxHeight }),
        heightEl,
        latest: null,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [frameRef, heightTarget, minWidth, minHeight, maxHeight],
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
        Object.assign(frame.style, { width: `${next.width}px`, maxWidth: "100%", marginInline: "auto" });
      }
      if (drag.heightEl && next.height !== drag.start.height) drag.heightEl.style.height = `${next.height}px`;
    },
    [frameRef],
  );

  const end = useCallback(() => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag?.latest || !frame) return;
    const commit: BlockResizeCommit = {};
    if (drag.latest.width !== drag.start.width) {
      commit.widthPercent = widthPercentOf(drag.latest.width, drag.column);
      // The render that follows writes the same value: React skips an unchanged style, so the
      // px the drag left behind would otherwise outlive a later column change.
      Object.assign(frame.style, { width: "", maxWidth: "", marginInline: "" }, blockWidthStyle(commit.widthPercent, minWidth));
    }
    if (drag.heightEl && drag.latest.height !== drag.start.height) commit.height = drag.latest.height;
    if (commit.widthPercent !== undefined || commit.height !== undefined) onCommit(commit);
  }, [frameRef, minWidth, onCommit]);

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
