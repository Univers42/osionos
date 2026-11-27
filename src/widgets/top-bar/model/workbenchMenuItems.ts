/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchMenuItems.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DockPosition, DockTab } from "@/widgets/workbench/model/workbenchLayout";
import type { MenuAction } from "./menuTypes";

/**
 * Decide what the Terminal menu should do for a "New Terminal" click.
 * Pure so the canvas test can cover every branch without stores.
 *
 * @returns "split" | "new" | "reattach"
 *   - "split"  → user chose Split Terminal (always split)
 *   - "new"    → dock already open on terminal tab → fresh session
 *   - "reattach" → otherwise (dock closed, or open on another tab) → reuse session
 */
export function terminalMenuAction(
  mode: "new" | "split",
  dock: { dockOpen: boolean; dockTab: DockTab },
): "split" | "new" | "reattach" {
  if (mode === "split") return "split";
  if (dock.dockOpen && dock.dockTab === "terminal") return "new";
  return "reattach";
}

export interface WorkbenchViewActionMap {
  toggleDock: () => void;
  toggleDockMaximized: () => void;
  toggleStatusBar: () => void;
  openProblems: () => void;
  openOutput: () => void;
  openPorts: () => void;
  isDockOpen: () => boolean;
  isDockMaximized: () => boolean;
  isStatusBarVisible: () => boolean;
}

/**
 * The Appearance rows that show or hide a workbench region. Both are checkbox
 * rows: they keep the ids the old View › Toggle rows had, and read their state
 * through the injected readers.
 */
export function workbenchAppearanceItems(actions: WorkbenchViewActionMap): MenuAction[] {
  return [
    { id: "view.panel", label: "Panel", accelerator: "⌃J", run: actions.toggleDock, checked: actions.isDockOpen },
    { id: "view.panel-maximize", label: "Maximize panel", run: actions.toggleDockMaximized, checked: actions.isDockMaximized },
    { id: "view.statusbar", label: "Status bar", run: actions.toggleStatusBar, checked: actions.isStatusBarVisible },
  ];
}

const POSITION_LABEL: ReadonlyArray<readonly [DockPosition, string]> = [["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]];

/**
 * The "Panel position" group of Customize Layout: Bottom, Left, Right, the one
 * matching `current()` checked. Pure over its two injected functions.
 */
export function panelPositionItems(current: () => DockPosition, setPosition: (position: DockPosition) => void): MenuAction[] {
  return POSITION_LABEL.map(([position, label]) => ({
    id: `layout.panel-position.${position}`, label, run: () => setPosition(position), checked: () => current() === position,
  }));
}

/**
 * The View-menu items that open a dock tab. The caller places them right after
 * an item that already ends a group, so the trailing separator closes this one.
 */
export function workbenchViewItems(actions: WorkbenchViewActionMap): MenuAction[] {
  return [
    { id: "view.problems", label: "Problems", run: actions.openProblems },
    { id: "view.output", label: "Output", run: actions.openOutput },
    { id: "view.ports", label: "Ports", run: actions.openPorts, separatorAfter: true },
  ];
}
