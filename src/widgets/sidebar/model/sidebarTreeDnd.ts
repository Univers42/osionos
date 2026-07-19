/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebarTreeDnd.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/**
 * Where a dragged row would land relative to the hovered row:
 * - "inside"  → becomes a child of the hovered row (depth + 1), shown as a tint.
 * - "before" / "after" → becomes a sibling at the SAME depth (shares the hovered
 *   row's parent), shown as a blue insertion line above / below.
 *
 * NOTE: the page model has no persisted sibling order yet, so "before"/"after"
 * both re-parent to the hovered row's parent and append. Add an `order` column
 * (PageEntry + BaaS) to honour the exact above/below index across reloads.
 */
export type DropMode = "inside" | "before" | "after";

/** What kind of payload is mid-drag, so panes only react to relevant drags. */
export type DragKind = "page" | "tab" | null;

interface SidebarTreeDndState {
  /** Id of the row currently being dragged (null when idle). */
  draggingId: string | null;
  /** What is being dragged across the workspace (sidebar page vs. a pane tab). */
  dragKind: DragKind;
  /** Row the pointer is hovering as a drop target. */
  dropTargetId: string | null;
  /** Resolved drop mode for `dropTargetId`. */
  dropMode: DropMode | null;
  /** Monotonic signal: bump to collapse every expanded folder in the tree. */
  collapseToken: number;
  beginDrag: (id: string) => void;
  beginTabDrag: () => void;
  endDrag: () => void;
  setDropTarget: (id: string | null, mode: DropMode | null) => void;
  bumpCollapse: () => void;
}

/**
 * A finished drag MUST reset the store no matter which handler consumed the
 * drop. Per-element `onDragEnd` cleanup is not enough: when the drop mutation
 * unmounts the drag SOURCE (a tab moved/split into another pane removes its
 * TabButton), the browser's `dragend` fires on a detached node and React never
 * delivers it — `dragKind` wedges "on", every pane keeps its transparent
 * drop-capture overlay mounted, and the whole workspace stops accepting
 * clicks/edits until a reload. One-shot window-level capture listeners are the
 * cleanup path that survives source unmount. The reset is deferred a tick so
 * bubble-phase drop handlers still read the live drag state first.
 */
let dragSafetyArmed = false;
function armDragEndSafety(endDrag: () => void): void {
  // Non-browser runtime (node test/SSR): no window events, nothing to arm.
  if (typeof globalThis.addEventListener !== "function") return;
  if (dragSafetyArmed) return;
  dragSafetyArmed = true;
  const finish = () => {
    dragSafetyArmed = false;
    globalThis.removeEventListener("drop", finish, true);
    globalThis.removeEventListener("dragend", finish, true);
    setTimeout(endDrag, 0);
  };
  globalThis.addEventListener("drop", finish, true);
  globalThis.addEventListener("dragend", finish, true);
}

export const useSidebarTreeDnd = create<SidebarTreeDndState>((set, get) => ({
  draggingId: null,
  dragKind: null,
  dropTargetId: null,
  dropMode: null,
  collapseToken: 0,
  beginDrag: (id) => {
    armDragEndSafety(() => get().endDrag());
    set({ draggingId: id, dragKind: "page", dropTargetId: null, dropMode: null });
  },
  beginTabDrag: () => {
    armDragEndSafety(() => get().endDrag());
    set({ dragKind: "tab", dropTargetId: null, dropMode: null });
  },
  endDrag: () => set({ draggingId: null, dragKind: null, dropTargetId: null, dropMode: null }),
  setDropTarget: (dropTargetId, dropMode) => set({ dropTargetId, dropMode }),
  bumpCollapse: () => set((state) => ({ collapseToken: state.collapseToken + 1 })),
}));
