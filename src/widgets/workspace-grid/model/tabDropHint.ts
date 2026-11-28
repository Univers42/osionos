/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tabDropHint.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 22:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 22:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface TabDropHint {
  index: number;
  replaceTabId?: string;
}

export interface TabSlot {
  left: number;
  width: number;
}

/**
 * Where a drop at `x` (in tab-list coordinates) lands. A tab inserts at the first slot whose
 * midpoint the pointer has not crossed; a page (VSCode-style) inserts in a tab's outer quarters
 * and replaces it in the middle half. Caveat: the slots are layout boxes, so while the tabs are
 * slid aside the pointer must cross a tab's resting midpoint (inside the open gap) to move the
 * gap past it — the price of hit areas that never move under the pointer (no oscillation).
 */
export function tabDropHint(x: number, slots: readonly TabSlot[], tabIds: readonly string[], kind: "tab" | "page"): TabDropHint {
  for (let index = 0; index < slots.length; index += 1) {
    const { left, width } = slots[index];
    if (kind === "tab") {
      if (x < left + width / 2) return { index };
      continue;
    }
    if (x < left + width * 0.25) return { index };
    if (x < left + width * 0.75) return { index, replaceTabId: tabIds[index] };
    if (x < left + width) return { index: index + 1 };
  }
  return { index: slots.length };
}

/** The index to pass to moveTab for a same-pane move: the tab leaves its old slot first. */
export function moveTargetIndex(fromIndex: number, dropIndex: number): number {
  return fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
}

/** Where the gap for a drop at `index` starts: that slot's left, or the end of the last tab. */
export function slotEdge(slots: readonly TabSlot[], index: number): number {
  if (index < slots.length) return slots[index].left;
  const last = slots.at(-1);
  return last ? last.left + last.width : 0;
}

/** The resting boxes of a strip's `[data-drop-item]` children. offsetLeft ignores the
 *  transforms that slide tabs aside, so these never move under the pointer; the strip
 *  must be their offsetParent (position: relative). */
export function readTabSlots(list: HTMLElement): TabSlot[] {
  return Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-drop-item]"), (item) => ({ left: item.offsetLeft, width: item.offsetWidth }));
}
