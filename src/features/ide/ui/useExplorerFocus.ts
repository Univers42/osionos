/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerFocus.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/** Roving tabindex + programmatic focus for the tree. Focus is requested by path
 *  and applied after the next commit, once the row exists in the DOM — the list keeps
 *  the tabbable row mounted even off-screen (useExplorerVirtualizer), and focus()
 *  scrolls it into view. `rowIndex` maps each visible path to its line. */
export function useExplorerFocus(rowIndex: ReadonlyMap<string, number>, firstRel: string) {
  const [focusedRel, setFocusedRel] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const wantFocus = React.useRef<string | null>(null);

  // A focused row that scrolled out of the visible list (collapsed, renamed, deleted)
  // falls back to the first row so the tree always keeps one tab stop.
  const tabbableRel = rowIndex.has(focusedRel) ? focusedRel : firstRel;

  React.useEffect(() => {
    const target = wantFocus.current;
    if (target === null) return;
    wantFocus.current = null;
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [];
    for (const element of items) if (element.dataset.rel === target) element.focus();
  });

  // Every request commits, so it is applied now or dropped. Re-focusing the row that is
  // already tabbable changed no state, so the request stayed armed until some later commit:
  // a row's own onFocus re-armed it, and a keystroke in a page title re-rendering the tree
  // pulled focus back to the row and lost the rest of the typing (#338).
  const [, commitRequest] = React.useState(0);
  const focusRow = React.useCallback((rel: string): void => {
    setFocusedRel(rel);
    wantFocus.current = rel;
    commitRequest((tick) => tick + 1);
  }, []);

  return { rootRef, tabbableRel, focusRow };
}
