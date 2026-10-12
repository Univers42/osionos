/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchMenuActions.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useIdeDockStore } from "@/features/ide/model/ideDockStore";
import { terminalMenuAction, workbenchViewItems, type MenuItemSpec } from "@/widgets/top-bar/model/workbenchMenuItems";
import { useWorkbenchStore } from "./workbenchStore";

/** Terminal menu with the workbench flag ON: the dock owns the terminal, IDE mode is never touched. */
export function openWorkbenchTerminal(mode: "new" | "split"): void {
  const workbench = useWorkbenchStore.getState();
  const ideDock = useIdeDockStore.getState();
  const action = terminalMenuAction(mode, { dockOpen: workbench.dockOpen, dockTab: workbench.dockTab });
  if (action === "split") ideDock.splitTerminal();
  else if (action === "new") ideDock.newTerminal();
  workbench.openDock("terminal");
}

export function workbenchViewMenu(): MenuItemSpec[] {
  const workbench = (): ReturnType<typeof useWorkbenchStore.getState> => useWorkbenchStore.getState();
  return workbenchViewItems({
    toggleDock: () => workbench().toggleDock(),
    toggleStatusBar: () => workbench().toggleStatusBar(),
    openProblems: () => workbench().openDock("problems"),
    openOutput: () => workbench().openDock("output"),
    openPorts: () => workbench().openDock("ports"),
  });
}
