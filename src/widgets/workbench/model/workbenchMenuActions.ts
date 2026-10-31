/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchMenuActions.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useIdeDockStore } from "@/features/ide/model/ideDockStore";
import { terminalOpensMachine } from "@/features/machines/model/machineChoice";
import { useMachinesStore } from "@/features/machines/model/machinesStore";
import { openOwnMachine } from "@/features/machines/model/machineWindowStore";
import { terminalMenuAction, workbenchViewItems, type MenuItemSpec } from "@/widgets/top-bar/model/workbenchMenuItems";
import { useWorkbenchStore } from "./workbenchStore";

/** Terminal menu: one click opens the person's own default machine in its window (own-machines
 *  plan §6), Settings › Machines when none is paired, and the dock's panel when none is online.
 *  Only before the list has loaded does the dock keep its terminal (the Run panel's runner). */
export function openWorkbenchTerminal(mode: "new" | "split"): void {
  // "start": machines exist but none is online; the dock's panel says which one to start.
  if (terminalOpensMachine(useMachinesStore.getState().machines) && openOwnMachine() !== "start") return;
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
