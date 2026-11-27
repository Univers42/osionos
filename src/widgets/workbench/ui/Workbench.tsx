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
import { useIdeFsSync } from "@/features/ide/model/useIdeFsSync";
import { usePageFileWriter } from "@/features/page-file/model/usePageFileWriter";
import { useSandboxHealthProbe } from "@/features/ide/model/sandboxHealthStore";
import { useMachinesStore } from "@/features/machines/model/machinesStore";
import { MachineWindowHost } from "@/features/machines/ui/MachineWindowHost";
import { useMediaQuery } from "@/shared/config/useMediaQuery";
import { PHONE_QUERY } from "@/shared/config/useResponsiveSidebar";
import { MainContent } from "@/widgets/page-renderer/ui/MainContent";
import { useDockHotkeys } from "@/widgets/workbench/model/useDockHotkeys";
import { useOpenDockOnRunRequest } from "@/widgets/workbench/model/useOpenDockOnRunRequest";
import { useOpenDockOnDebugStart } from "@/widgets/workbench/model/useOpenDockOnDebugStart";
import { dockPresence, effectiveDockPosition, type DockPosition } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { DockSplitter } from "./DockSplitter";
import { WorkbenchDock } from "./WorkbenchDock";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";

const GRID: Readonly<Record<"shown" | "hidden", string>> = Object.freeze({
  shown: "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
  hidden: "relative hidden min-h-0 min-w-0 flex-1 overflow-hidden",
});

const BODY: Readonly<Record<DockPosition, string>> = Object.freeze({
  bottom: "flex min-h-0 min-w-0 flex-1 flex-col",
  right: "flex min-h-0 min-w-0 flex-1 flex-row",
  left: "flex min-h-0 min-w-0 flex-1 flex-row-reverse",
});

/** The unified region: the workspace grid beside or over a resizable dock, one status bar. The
 *  workbench is the only layout; rail and top bar stay App's. The dock sits at the bottom, left
 *  or right by flex direction alone (row-reverse for the left), so the DOM order never changes
 *  and moving it never remounts the terminal. A phone always gets the bottom.
 *
 *  Ponytail: in left mode the tab order is main, splitter, dock while the dock is drawn first;
 *  reordering the DOM to match would remount the terminal, so it is left as it is. */
export const Workbench: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const dockOpen = useWorkbenchStore((s) => s.dockOpen);
  const statusBarVisible = useWorkbenchStore((s) => s.statusBarVisible);
  const [dockEverOpened, setDockEverOpened] = React.useState(dockOpen);
  if (dockOpen && !dockEverOpened) setDockEverOpened(true);
  const dock = dockPresence({ open: dockOpen, everOpened: dockEverOpened });
  const maximized = useWorkbenchStore((s) => s.dockOpen && s.dockMaximized);
  const storedPosition = useWorkbenchStore((s) => s.dockPosition);
  const position = effectiveDockPosition(storedPosition, useMediaQuery(PHONE_QUERY));

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
      <div data-testid="workbench-body" data-dock-position={position}
        data-dock-maximized={maximized ? "true" : undefined} className={BODY[position]}>
        <div data-testid="workbench-grid" className={GRID[maximized ? "hidden" : "shown"]}>
          <MainContent />
        </div>
        {/* The same tree whether shown or hidden, so hiding never remounts the shell. */}
        {dock !== "absent" && (
          <div className={dock === "shown" ? "contents" : "hidden"}>
            {!maximized && <DockSplitter position={position} />}
            <WorkbenchDock position={position} maximized={maximized} />
          </div>
        )}
      </div>
      {statusBarVisible && <WorkbenchStatusBar />}
    </div>
  );
};
