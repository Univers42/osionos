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
import { useSandboxHealthProbe } from "@/features/ide/model/sandboxHealthStore";
import { MainContent } from "@/widgets/page-renderer/ui/MainContent";
import { useDockHotkeys } from "@/widgets/workbench/model/useDockHotkeys";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { DockSplitter } from "./DockSplitter";
import { WorkbenchDock } from "./WorkbenchDock";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";

/** The unified region (flag `osio.workbench`): workspace grid over a resizable
 *  dock, one status bar. Replaces the nested IDE shell; rail and top bar stay App's. */
export const Workbench: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const dockOpen = useWorkbenchStore((s) => s.dockOpen);
  const statusBarVisible = useWorkbenchStore((s) => s.statusBarVisible);

  useSandboxHealthProbe(workspaceId, true);
  // Always enabled: unlike the legacy shell there is no per-workspace IDE mode;
  // the hook itself no-ops without a bridge URL or workspace.
  useIdeFsSync(workspaceId, true);
  useDockHotkeys();

  return (
    <div data-osio-workbench className="flex h-full w-full min-w-0 flex-col">
      <div data-testid="workbench-grid" className="relative flex min-h-0 flex-1 overflow-hidden">
        <MainContent />
      </div>
      {dockOpen && (
        <>
          <DockSplitter />
          <WorkbenchDock />
        </>
      )}
      {statusBarVisible && <WorkbenchStatusBar />}
    </div>
  );
};
