// A menu's scroll region that is cut by a fixed height ends wherever the pixels
// run out, which can be halfway through a row: a half-visible "Delete" reads as a
// rendering glitch. Snapping the region's height to a row boundary makes every
// row either fully visible or fully scrolled away.

/** The largest row bottom that fits in `limit`, or `limit` when not even the first row does. */
export function snappedHeight(rowBottoms: readonly number[], limit: number): number {
  const fitting = rowBottoms.filter((bottom) => bottom <= limit);
  return fitting.length > 0 ? Math.max(...fitting) : limit;
}

const ROW = '[role="menuitem"], [role="option"]';

// Ponytail: measured when the caller re-runs it, in the element's own px (offsetTop
// needs `region` to be positioned, which makes it the rows' offsetParent). A
// density or font-size change while the menu is open keeps the old boundary:
// still a row edge, but no longer the last one that fits.
/** Ends `region` on a row edge; call again after its rows change. */
export function snapToRows(region: HTMLElement) {
  // Clearing the cap clamps scrollTop to the taller region's range, so a menu
  // that re-renders under the pointer would shift its rows between mousedown and click.
  const { scrollTop } = region;
  region.style.maxHeight = "";
  if (region.scrollHeight > region.clientHeight) {
    const bottoms = [...region.querySelectorAll<HTMLElement>(ROW)].map((row) => row.offsetTop + row.offsetHeight);
    region.style.maxHeight = `${snappedHeight(bottoms, region.clientHeight)}px`;
  }
  region.scrollTop = scrollTop;
}
