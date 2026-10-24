import { useEffect, useState, type RefObject } from "react";

/**
 * The height a panel would have if its scroll region were not capped: the panel's
 * own height with the region's visible part swapped for its full content. Lets a
 * menu be placed by what it needs rather than by a fixed guess.
 *
 * `undefined` until the first measurement, which lands one frame after `content`
 * changes; a caller that must not flash the unplaced panel hides it until then.
 */
export function useNaturalHeight(
  panel: RefObject<HTMLElement | null>,
  region: RefObject<HTMLElement | null>,
  content: unknown,
) {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!panel.current || !region.current) return;
      setHeight(panel.current.offsetHeight - region.current.clientHeight + region.current.scrollHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [panel, region, content]);
  return height;
}
