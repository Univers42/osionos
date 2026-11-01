/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Workbench.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { useUserStore } from "@/features/auth";
import { hasLocalTerminal } from "@/features/ide/model/localPty";
import { useIdeFsSync } from "@/features/ide/model/useIdeFsSync";
import { usePageFileWriter } from "@/features/page-file/model/usePageFileWriter";
import { useSandboxHealthProbe } from "@/features/ide/model/sandboxHealthStore";
import { useMachinesStore } from "@/features/machines/model/machinesStore";
import { MachineWindowHost } from "@/features/machines/ui/MachineWindowHost";
import { MainContent } from "@/widgets/page-renderer/ui/MainContent";
import { useDockHotkeys } from "@/widgets/workbench/model/useDockHotkeys";
import { useOpenDockOnRunRequest } from "@/widgets/workbench/model/useOpenDockOnRunRequest";
import { useOpenDockOnDebugStart } from "@/widgets/workbench/model/useOpenDockOnDebugStart";
import { dockPresence } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { DockSplitter } from "./DockSplitter";
import { WorkbenchDock } from "./WorkbenchDock";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";

/** The unified region: workspace grid over a resizable
 *  dock, one status bar. The workbench is the only layout; rail and top bar stay App's. */
export const Workbench: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const dockOpen = useWorkbenchStore((s) => s.dockOpen);
  const statusBarVisible = useWorkbenchStore((s) => s.statusBarVisible);
  // The preload is fixed for the window's life, so it is read once.
  const [keepsShell] = React.useState(hasLocalTerminal);
  const [dockEverOpened, setDockEverOpened] = React.useState(dockOpen);
  if (dockOpen && !dockEverOpened) setDockEverOpened(true);
  const dock = dockPresence({ open: dockOpen, everOpened: dockEverOpened, keepsShell });

  useSandboxHealthProbe(workspaceId, true);
  // Always enabled: unlike the legacy shell there is no per-workspace IDE mode;
  // the hook itself no-ops without a bridge URL or workspace.
  useIdeFsSync(workspaceId, true);
  usePageFileWriter(workspaceId, true);
  useDockHotkeys();
  useOpenDockOnRunRequest();
  useOpenDockOnDebugStart();
  // The Terminal menu decides inside its click, so the machine list is known before it.
  React.useEffect(() => {
    if (workspaceId) void useMachinesStore.getState().refresh();
  }, [workspaceId]);

  return (
    <div data-osio-workbench className="flex h-full w-full min-w-0 flex-col">
      <MachineWindowHost />
      <div data-testid="workbench-grid" className="relative flex min-h-0 flex-1 overflow-hidden">
        <MainContent />
      </div>
      {/* The same tree whether shown or hidden, so hiding never remounts the shell. */}
      {keepsShell && dock !== "absent" && (
        <div className={dock === "shown" ? "contents" : "hidden"}>
          <DockSplitter />
          <WorkbenchDock />
        </div>
      )}
      {!keepsShell && dock === "shown" && (
        <>
          <DockSplitter />
          <WorkbenchDock />
        </>
      )}
      {statusBarVisible && <WorkbenchStatusBar />}
    </div>
  );
};
