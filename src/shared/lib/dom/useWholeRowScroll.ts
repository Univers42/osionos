import { useLayoutEffect, type RefObject } from "react";

import { snapToRows } from "./wholeRowScroll";

/** Keeps `ref`'s scroll region ending on a row edge; `rows` is whatever the region lists, so a change re-snaps it. */
export function useWholeRowScroll(ref: RefObject<HTMLElement | null>, rows: unknown) {
  useLayoutEffect(() => {
    if (ref.current) snapToRows(ref.current);
  }, [ref, rows]);
}
