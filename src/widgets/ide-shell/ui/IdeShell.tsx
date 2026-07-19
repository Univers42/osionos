/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeShell.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { WorkspaceGrid } from "@/widgets/workspace-grid";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { useIdeModeStore } from "@/features/ide/model/ideModeStore";
import { buildIdeFileTree, flattenIdeTree } from "@/features/ide/model/ideFileTree";
import { IdeActivityBar } from "./IdeActivityBar";
import { IdeSidePanel } from "./IdeSidePanel";
import { IdeBottomStrip } from "./IdeBottomStrip";
import { IdeStatusBar } from "./IdeStatusBar";

const EMPTY: never[] = [];

/**
 * The dedicated VS Code-style IDE layout. It REUSES the existing WorkspaceGrid
 * as its editor area (panes, tabs, splits — never a forked tree), wrapping it
 * with an activity bar, a side panel (Explorer/Search/SCM/Run/Problems), a
 * collapsible terminal strip, and a status bar. Mounted from App's content
 * region only when `osio.ide` is on AND this workspace is in IDE mode.
 */
export const IdeShell: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId]) ?? EMPTY;
  const activePanel = useIdeModeStore((s) => s.activePanel);
  const setPanel = useIdeModeStore((s) => s.setPanel);
  const bottomOpen = useIdeModeStore((s) => s.bottomOpen);
  const toggleBottom = useIdeModeStore((s) => s.toggleBottom);
  const setIdeMode = useIdeModeStore((s) => s.setIdeMode);

  const fileCount = React.useMemo(
    () => flattenIdeTree(buildIdeFileTree(pages)).filter((node) => !node.isFolder).length,
    [pages],
  );

  return (
    <div data-osio-ide-shell data-code-theme="dark" className="flex h-full w-full flex-col bg-[var(--osio-code-bg)]">
      <div className="flex min-h-0 flex-1">
        <IdeActivityBar active={activePanel} onSelect={setPanel} onExit={() => setIdeMode(workspaceId, false)} />
        <IdeSidePanel panel={activePanel} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden bg-[var(--osio-bg-page)]">
            <WorkspaceGrid />
          </div>
          {bottomOpen && <IdeBottomStrip onClose={toggleBottom} />}
        </div>
      </div>
      <IdeStatusBar fileCount={fileCount} onToggleTerminal={toggleBottom} />
    </div>
  );
};
