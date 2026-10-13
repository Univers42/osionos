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

import type { DockTab } from "@/widgets/workbench/model/workbenchLayout";

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
  toggleStatusBar: () => void;
  openProblems: () => void;
  openOutput: () => void;
  openPorts: () => void;
}

export interface MenuItemSpec {
  id: string;
  label: string;
  accelerator?: string;
  run: () => void;
  separatorAfter?: boolean;
}

/**
 * The View-menu items for the workbench (panel/status bar, then the dock tabs).
 * The caller places them right after an item that already ends a group, so the
 * trailing separator closes the second group.
 */
export function workbenchViewItems(actions: WorkbenchViewActionMap): MenuItemSpec[] {
  return [
    { id: "view.panel", label: "Toggle Panel", accelerator: "⌃J", run: actions.toggleDock },
    { id: "view.statusbar", label: "Toggle Status Bar", run: actions.toggleStatusBar, separatorAfter: true },
    { id: "view.problems", label: "Problems", run: actions.openProblems },
    { id: "view.output", label: "Output", run: actions.openOutput },
    { id: "view.ports", label: "Ports", run: actions.openPorts, separatorAfter: true },
  ];
}
