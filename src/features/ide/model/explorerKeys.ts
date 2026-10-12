/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerKeys.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { VisibleItem } from "./explorerRows";

export type ExplorerKeyAction =
  | { type: "focus"; rel: string }
  | { type: "expand" | "collapse" | "activate" | "rename" | "delete"; rel: string };

/** WAI-ARIA tree keyboard map as a pure function of the visible list, so it is
 *  testable without a DOM. Moving items by keyboard is out of scope: drag-and-drop
 *  is the only move gesture today (rename to a new path is the keyboard route). */
export function explorerKeyAction(
  key: string,
  visible: readonly VisibleItem[],
  currentRel: string,
  expanded: ReadonlySet<string>,
): ExplorerKeyAction | null {
  const index = visible.findIndex((item) => item.rel === currentRel);
  const current = visible[index];
  if (!current) return null;
  const isDir = current.row.kind === "dir";
  const open = isDir && expanded.has(current.rel);
  const focus = (item: VisibleItem | undefined): ExplorerKeyAction | null =>
    item ? { type: "focus", rel: item.rel } : null;

  switch (key) {
    case "ArrowDown": return focus(visible[index + 1]);
    case "ArrowUp": return focus(visible[index - 1]);
    case "Home": return focus(visible[0]);
    case "End": return focus(visible[visible.length - 1]);
    case "ArrowRight":
      if (!isDir) return null;
      return open ? focus(visible[index + 1]?.parentRel === current.rel ? visible[index + 1] : undefined) : { type: "expand", rel: current.rel };
    case "ArrowLeft":
      if (open) return { type: "collapse", rel: current.rel };
      return focus(visible.find((item) => item.rel === current.parentRel));
    case "Enter": return { type: "activate", rel: current.rel };
    case "F2": return { type: "rename", rel: current.rel };
    case "Delete": return { type: "delete", rel: current.rel };
    default: return null;
  }
}
