import { useLayoutEffect, useState, type RefObject } from "react";

import { availableWidth } from "./blockResize";

export interface BreakoutLayout {
  /** The text column the block's width is a share of, in px. 0 until measured. */
  column: number;
  /** The widest the block may be in its pane, in px. */
  available: number;
}

/** The pane a block lives in: its nearest size container (the page scroller), else the window. */
export function paneOf(element: Element): Element {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).containerType !== "normal") return node;
  }
  return document.documentElement;
}

/** The width an element's children lay out in: its content box, padding excluded, the box a
 *  CSS percentage resolves against. */
function contentWidth(element: Element): number {
  const style = getComputedStyle(element);
  return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
}

/** Measures a block's column (the band's parent) and pane. */
export function measureBreakout(band: HTMLElement): BreakoutLayout {
  const column = band.parentElement ? contentWidth(band.parentElement) : 0;
  return { column, available: availableWidth(contentWidth(paneOf(band))) };
}

/** The column and pane widths of a block that may break out of its column, kept current
 *  while either resizes. Only a block wider than its column needs them (`active`), so the
 *  others observe nothing. */
export function useBreakoutLayout(bandRef: RefObject<HTMLElement | null>, active: boolean): BreakoutLayout {
  const [layout, setLayout] = useState<BreakoutLayout>({ column: 0, available: 0 });

  useLayoutEffect(() => {
    const band = bandRef.current;
    if (!active || !band?.parentElement) return undefined;
    const update = () => {
      const next = measureBreakout(band);
      setLayout((previous) => (previous.column === next.column && previous.available === next.available ? previous : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(band.parentElement);
    observer.observe(paneOf(band));
    return () => observer.disconnect();
  }, [bandRef, active]);

  return layout;
}
