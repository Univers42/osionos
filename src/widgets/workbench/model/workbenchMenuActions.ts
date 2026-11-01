/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchMenuActions.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useIdeDockStore } from "@/features/ide/model/ideDockStore";
import { hasLocalTerminal } from "@/features/ide/model/localPty";
import { openOwnMachine } from "@/features/machines/model/machineWindowStore";
import { terminalMenuAction, workbenchViewItems, type MenuItemSpec } from "@/widgets/top-bar/model/workbenchMenuItems";
import { useWorkbenchStore } from "./workbenchStore";

/** Terminal menu: in the desktop app the dock's terminal, a shell on this computer. On the web, one
 *  click opens this computer's osionos-node in its window (owner 2026-11-01), whatever the account's
 *  list says, and the dock shows the terminal panel, which follows that window's state. */
export function openWorkbenchTerminal(mode: "new" | "split"): void {
  if (!hasLocalTerminal()) {
    openOwnMachine();
    useWorkbenchStore.getState().openDock("terminal");
    return;
  }
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
