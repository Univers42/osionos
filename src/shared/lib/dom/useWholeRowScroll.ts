import { useLayoutEffect, type RefObject } from "react";

import { snapToRows, syncScrollCue } from "./wholeRowScroll";

/**
 * Keeps `ref`'s scroll region ending on a row edge and its fade cue current.
 * `rows` is whatever the region lists and `limit` the room it is given, so a
 * change to either re-snaps it.
 */
export function useWholeRowScroll(ref: RefObject<HTMLElement | null>, rows: unknown, limit?: number) {
  useLayoutEffect(() => {
    const region = ref.current;
    if (!region) return;
    snapToRows(region);
    syncScrollCue(region);
    const onScroll = () => syncScrollCue(region);
    region.addEventListener("scroll", onScroll, { passive: true });
    return () => region.removeEventListener("scroll", onScroll);
  }, [ref, rows, limit]);
}
