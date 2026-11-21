// Freezes the slash panel's height at what it measured when the menu opened, for the
// life of that menu, so filtering the list down never moves either edge of the panel
// (#330): a click aimed at an entry's old position still lands inside it instead of
// on the page, where the outside-mousedown handler would close the menu with no pick.
// Measures offsetHeight (layout box): the open animation's scale does not skew it.
// Written to the element, not held in state: it runs once per open menu and a state
// round-trip would paint the unfrozen panel for a frame first.
// Caveat: the first measurement is taken as the full list. A menu that opens already
// filtered, or whose catalog fills in after the first frame, keeps that smaller height
// and scrolls inside it. A ratchet (hold the max) was tried and rejected: the list's
// whole-row snapping changes the panel by up to a row between filter steps.

import { useLayoutEffect, type RefObject } from "react";

function freezeHeight(element: HTMLElement): void {
  element.style.height = `${element.offsetHeight}px`;
}

export function useHeldMenuHeight(panel: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (panel.current) freezeHeight(panel.current);
  }, [panel]);
}
