/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useCallback } from "react";
import { SidebarFooter } from "@/widgets/sidebar/ui/SidebarFooter";
import { FolderRail } from "@/widgets/home-variants/ui/HomeWorkspaceParts";
import { WorkspaceExplorer } from "@/features/ide/ui/WorkspaceExplorer";
import { useWorkspaceFileOps } from "@/features/ide/model/useWorkspaceFileOps";
import { ExplorerRecents } from "./ExplorerRecents";
import { ExplorerViewSwitch } from "./ExplorerViewSwitch";
import { useExplorerView } from "../../model/explorerView";
import { useFetchActiveWorkspacePages } from "../../model/useFetchActiveWorkspacePages";
import { pageIdForEntry, pageIdForDir } from "../../model/workspaceEntry";
import { usePageStore } from "@/store/usePageStore";
import type { ExplorerRowKind } from "@/features/ide/model/explorerRows";

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
  /** Opens a tree entry. The rel-path to page/editor mapping is the caller's. */
  onOpenFile?: (relPath: string, kind: "page" | "code") => void;
}

const NOOP_OPEN = (): void => undefined;

/** Files rail panel hosting the VFS explorer: same shell as FilesPanel, with
 *  the VFS tree in place of SidebarPageTree and a compact Recents strip. */
export const ExplorerPanel: React.FC<Props> = ({ onOpenSettings, onOpenTrash, onOpenConsole, onOpenFile = NOOP_OPEN }) => {
  const explorerView = useExplorerView((s) => s.view);
  const { activeWorkspaceId } = useFetchActiveWorkspacePages();
  const { ops } = useWorkspaceFileOps();
  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const pageIdOf = useCallback(
    (rel: string, kind: ExplorerRowKind): string | undefined => {
      const pages = usePageStore.getState().pages[activeWorkspaceId] ?? [];
      if (kind === "dir") return pageIdForDir(activeWorkspaceId, pages, rel);
      return pageIdForEntry(activeWorkspaceId, pages, rel);
    },
    [activeWorkspaceId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ExplorerViewSwitch />
      {/* touch-action: pan-y keeps vertical scroll but reserves the drag gesture
          for our HTML5 DnD — without it, a draggable row low in this
          overflow-y-auto container loses the press to scroll-arbitration and its
          `dragstart` never fires (rows higher up, with scroll headroom, still
          grab fine — the scroll-position-dependent "can't grab lower" bug). */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1.5 pb-5" style={{ touchAction: "pan-y" }}>
        {explorerView === "gallery" ? (
          <FolderRail />
        ) : (
          <>
            <ExplorerRecents activeWorkspaceId={activeWorkspaceId} />
            <WorkspaceExplorer ops={ops} onOpen={onOpenFile} pageIdOf={pageIdOf} />
          </>
        )}
      </nav>
      <SidebarFooter
        onOpenSettings={onOpenSettings}
        onOpenTrash={onOpenTrash}
        onOpenConsole={onOpenConsole}
        showInviteCTA={showInviteCTA}
        onDismissInvite={() => setShowInviteCTA(false)}
      />
    </div>
  );
};
