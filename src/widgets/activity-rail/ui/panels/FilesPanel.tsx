/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   FilesPanel.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { SidebarPageTree } from "@/widgets/sidebar/ui/SidebarPageTree";
import { SidebarFooter } from "@/widgets/sidebar/ui/SidebarFooter";
import { FolderRail } from "@/widgets/home-variants/ui/HomeWorkspaceParts";
import { ExplorerViewSwitch } from "./ExplorerViewSwitch";
import { useExplorerView } from "../../model/explorerView";

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
}

/** Files panel: the workspace page tree (Recents / Private / Shared) + footer.
 *  Reuses the existing SidebarPageTree; mirrors the prop-building from the old
 *  Sidebar so behavior (DnD, access filtering, channels) is unchanged. */
export const FilesPanel: React.FC<Props> = ({ onOpenSettings, onOpenTrash, onOpenConsole }) => {
  const explorerView = useExplorerView((s) => s.view);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const activeWorkspaceOwnerId = useUserStore((s) => s.activeWorkspace()?.ownerId ?? "");
  const activePageId = usePageStore((s) => s.activePage?.id ?? null);
  const activePageKind = usePageStore((s) => s.activePage?.kind ?? null);
  const recents = usePageStore((s) => s.recents);
  const fetchPages = usePageStore((s) => s.fetchPages);
  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);

  const [showInviteCTA, setShowInviteCTA] = useState(true);

  const privateWorkspaces = useMemo(
    () => (activeWorkspaceId && activeWorkspaceOwnerId === activeUserId ? [{ _id: activeWorkspaceId }] : []),
    [activeUserId, activeWorkspaceId, activeWorkspaceOwnerId],
  );
  const sharedWorkspaces = useMemo(
    () => (activeWorkspaceId && activeWorkspaceOwnerId !== activeUserId ? [{ _id: activeWorkspaceId }] : []),
    [activeUserId, activeWorkspaceId, activeWorkspaceOwnerId],
  );

  useEffect(() => {
    if (activeWorkspaceId && jwt) fetchPages(activeWorkspaceId, jwt);
  }, [activeWorkspaceId, jwt, fetchPages]);

  const handleAddToWorkspace = useCallback(
    (wsId: string) => {
      addPage(wsId, "Untitled", jwt).then((page) => {
        if (page) openPage({ id: page._id, workspaceId: wsId, kind: "page", title: page.title });
      });
    },
    [addPage, jwt, openPage],
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
          <SidebarPageTree
            recents={recents}
            activePageId={activePageId}
            activePageKind={activePageKind}
            activeWorkspaceId={activeWorkspaceId}
            openPage={openPage}
            privateWorkspaces={privateWorkspaces}
            sharedWorkspaces={sharedWorkspaces}
            jwt={jwt}
            onAddToWorkspace={handleAddToWorkspace}
          />
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
