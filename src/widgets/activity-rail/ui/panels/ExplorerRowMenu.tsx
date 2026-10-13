/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerRowMenu.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from "react";
import { usePageStore } from "@/store/usePageStore";
import type { ExplorerMenuRequest } from "@/features/ide/ui/useExplorerController";
import { PageContextMenu } from "@/features/page-management/context-menu/PageContextMenu";
import type { MenuActionCtx } from "@/features/page-management/context-menu/types";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { usePageContextClipboard } from "@/features/page-management/context-menu/clipboardStore";
import { useToastStore } from "@osionos/ui/primitives";

interface Props {
  request: ExplorerMenuRequest;
  workspaceId: string;
  jwt: string;
  onClose(): void;
}

/** Page actions menu for the workbench explorer row.
 *  Mirrors the context built by PageTreeItem (lines 132-146) so the same
 *  registry actions work without duplication. */
export const ExplorerRowMenu: React.FC<Props> = ({ request, workspaceId, jwt, onClose }) => {
  const page = usePageStore.getState().pageById(request.pageId ?? "");

  // A request without a page, or whose page is gone, has nothing
  // to act on: render nothing and let the host drop the request.
  useEffect(() => {
    if (!request.pageId || !page) onClose();
  }, [request.pageId, page, onClose]);

  if (!request.pageId || !page) return null;

  const isFolder = page.surface === "folder";

  const ctx: MenuActionCtx = {
    page,
    isFolder,
    workspaceId,
    jwt,
    store: usePageStore,
    layout: useWorkspaceLayout,
    clipboard: usePageContextClipboard,
    toast: useToastStore.getState().push,
    onRename: request.rename,
    onDelete: request.remove,
    workspacePages: () => usePageStore.getState().pages[workspaceId] ?? [],
  };

  return (
    <PageContextMenu
      x={request.x}
      y={request.y}
      ctx={ctx}
      onClose={() => {
        onClose();
        request.restoreFocus();
      }}
    />
  );
};