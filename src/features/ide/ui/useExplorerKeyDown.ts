/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerKeyDown.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { explorerKeyAction } from "../model/explorerKeys";
import type { ExplorerRow, VisibleItem } from "../model/explorerRows";
import type { ExplorerPending, ExplorerContextValue } from "./explorerContext";

type Params = {
  visible: readonly VisibleItem[];
  tabbableRel: string;
  expanded: ReadonlySet<string>;
  setOpen: (dir: string, open: boolean) => void;
  focusRow: (rel: string) => void;
  activate: (rel: string, row: ExplorerRow) => void;
  setPending: (pending: ExplorerPending) => void;
  rootRef: React.RefObject<HTMLElement | null>;
  openMenu: ExplorerContextValue["openMenu"];
};

/** Applies the pure key map (explorerKeys.ts) to the tree. Keys typed into the
 *  inline input or pressed on a button belong to those controls, not the tree. */
export function useExplorerKeyDown(params: Params) {
  const { visible, tabbableRel, expanded, setOpen, focusRow, activate, setPending, rootRef, openMenu } = params;
  return (event: React.KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    // Shift+F10 is the standard keyboard equivalent of right-click; map it to
    // "ContextMenu" before the pure key map so the same logic runs.
    const key = event.shiftKey && event.key === "F10" ? "ContextMenu" : event.key;
    const action = explorerKeyAction(key, visible, tabbableRel, expanded);
    if (!action) return;
    event.preventDefault();
    const { rel } = action;
    switch (action.type) {
      case "focus": focusRow(rel); break;
      case "expand": setOpen(rel, true); break;
      case "collapse": setOpen(rel, false); break;
      case "rename": setPending({ type: "rename", rel }); break;
      case "delete": setPending({ type: "delete", rel }); break;
      case "activate": {
        const row = visible.find((item) => item.rel === rel)?.row;
        if (row) activate(rel, row);
        break;
      }
      case "menu": {
        const root = rootRef.current;
        if (!root) return;
        const rowEl = root.querySelector<HTMLElement>(`[data-rel="${CSS.escape(rel)}"]`);
        if (!rowEl) return;
        const row = visible.find((item) => item.rel === rel)?.row;
        if (!row) return;
        const rect = rowEl.getBoundingClientRect();
        openMenu(rel, row, { x: rect.left + 16, y: rect.bottom });
        break;
      }
    }
  };
}
