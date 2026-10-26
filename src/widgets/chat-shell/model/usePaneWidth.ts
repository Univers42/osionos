import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The width of the pane the element sits in. A split can make the assistant's pane far
 * narrower than the window, so the rails follow the pane, not the viewport. Measured before
 * paint, so a wide pane opens with its rails and no flash; 0 where nothing is laid out.
 */
export function usePaneWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
