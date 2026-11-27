/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editorLayoutMenu.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { collectPanes, findPane, genId } from "@/widgets/workspace-grid/model/layoutTree";
import type { MenuAction, MenuSubmenu } from "../menuTypes";
import { layout } from "./menuActions";

type SplitDirection = "row" | "column";
type SplitSide = "before" | "after";

/**
 * Splits the active pane, putting a copy of its active tab on the given side.
 * `splitActivePane` only goes after, so up and left go through `splitWith`.
 */
function splitActive(direction: SplitDirection, side: SplitSide): void {
  const state = layout();
  const pane = findPane(state.root, state.activePaneId);
  const active = pane?.tabs.find((t) => t.tabId === pane.activeTabId) ?? pane?.tabs[0];
  if (!pane || !active) return;
  state.splitWith(pane.id, direction, { ...active, tabId: genId("tab") }, side);
}

/** True while more than one pane is open. */
function hasSeveralPanes(): boolean {
  return collectPanes(layout().root).length > 1;
}

/**
 * Collapses to one pane without losing a tab: every other pane's tabs are
 * moved into the active pane with `moveTab` (which drops the emptied pane).
 */
function collapseToSinglePane(): void {
  const keep = layout().activePaneId;
  for (const pane of collectPanes(layout().root)) {
    if (pane.id === keep) continue;
    for (const tab of pane.tabs) layout().moveTab(pane.id, tab.tabId, keep);
  }
  layout().setActivePane(keep);
}

function splitRow(id: string, label: string, direction: SplitDirection, side: SplitSide, accelerator?: string): MenuAction {
  return { id, label, accelerator, run: () => splitActive(direction, side) };
}

/** View › Editor layout. Labels differ from Selection's "Split editor …" rows because the palette dedupes by label. */
export function editorLayoutSubmenu(): MenuSubmenu {
  return {
    id: "view.editor-layout", label: "Editor layout", children: [
      splitRow("layout.split-up", "Split up", "column", "before"),
      splitRow("layout.split-down", "Split down", "column", "after"),
      splitRow("layout.split-left", "Split left", "row", "before"),
      { ...splitRow("layout.split-right", "Split right", "row", "after", "Ctrl+\\"), separatorAfter: true },
      { id: "layout.single", label: "Single", run: collapseToSinglePane, disabled: () => !hasSeveralPanes() },
    ],
  };
}
