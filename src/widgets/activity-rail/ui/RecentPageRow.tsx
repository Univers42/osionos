/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecentPageRow.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { useToastStore } from "@osionos/ui/primitives";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { ExplorerDeleteConfirm } from "@/features/ide/ui/ExplorerStates";
import { IdeInlineInput } from "@/features/ide/ui/IdeInlineInput";
import { validateName } from "@/features/ide/model/workspacePath";
import { PageContextMenu } from "@/features/page-management/context-menu/PageContextMenu";
import type { MenuActionCtx } from "@/features/page-management/context-menu/types";
import { usePageContextClipboard } from "@/features/page-management/context-menu/clipboardStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { SidebarNavItem } from "./SidebarNavItem";
import { selectPageAccessEntry } from "../model/pageAccessEntry";

interface RecentPageRowProps {
  recent: ActivePage;
  activePageId: string | null | undefined;
  onOpenPage: (page: ActivePage) => void;
}

/** One recently visited page; hidden when it is not loaded or not readable. */
export const RecentPageRow: React.FC<RecentPageRowProps> = ({ recent, activePageId, onOpenPage }) => {
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!page || !canReadPage(page, accessContext)) return null;

  // The recent is a visit-time snapshot (a rename never re-saves it); the loaded page is current (#84).
  const current: ActivePage = { ...recent, title: page.title, icon: page.icon };
  const menuCtx: MenuActionCtx = {
    page,
    isFolder: page.surface === "folder",
    workspaceId: page.workspaceId,
    jwt,
    store: usePageStore,
    layout: useWorkspaceLayout,
    clipboard: usePageContextClipboard,
    toast: useToastStore.getState().push,
    onRename: () => setRenaming(true),
    onDelete: () => setConfirmDelete(true),
    workspacePages: () => usePageStore.getState().pages[page.workspaceId] ?? [],
  };

  const restoreFocus = (): void => {
    requestAnimationFrame(() => rowRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!renaming) setMenu({ x: event.clientX, y: event.clientY });
  };

  const submitRename = (name: string): void => {
    try {
      usePageStore.getState().updatePageTitle(page._id, validateName(name));
    } catch (error) {
      useToastStore.getState().push({
        kind: "error",
        title: "Could not rename page",
        description: error instanceof Error ? error.message : String(error),
      });
    }
    setRenaming(false);
  };

  const confirmArchive = (): void => {
    void usePageStore.getState().archivePage(page._id, page.workspaceId, jwt).then(
      () => setConfirmDelete(false),
      (error: unknown) => useToastStore.getState().push({
        kind: "error",
        title: "Could not move page to Trash",
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  return (
    <div ref={rowRef} onContextMenu={onContextMenu} data-recent-page-id={page._id}>
      {renaming ? (
        <div
          className="flex h-7 cursor-text select-none items-center gap-2 rounded-[6px] pr-2 text-base font-medium text-[var(--osio-fg-muted)]"
          style={{ paddingLeft: 10 }}
        >
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
            <IconValueView value={current.icon || "icon:page"} size={14} />
          </span>
          <IdeInlineInput
            initialValue={current.title || "Untitled"}
            label={`Rename ${current.title || "Untitled"}`}
            placeholder="Rename"
            onSubmit={submitRename}
            onCancel={() => { setRenaming(false); restoreFocus(); }}
          />
        </div>
      ) : (
        <SidebarNavItem
          icon={<IconValueView value={current.icon || "icon:page"} size={14} />}
          label={current.title || "Untitled"}
          active={activePageId === recent.id}
          onClick={() => onOpenPage(current)}
        />
      )}
      {menu && (
        <PageContextMenu
          x={menu.x}
          y={menu.y}
          ctx={menuCtx}
          onClose={() => { setMenu(null); restoreFocus(); }}
        />
      )}
      {confirmDelete && (
        <ExplorerDeleteConfirm
          name={current.title || "Untitled"}
          onCancel={() => { setConfirmDelete(false); restoreFocus(); }}
          onConfirm={confirmArchive}
        />
      )}
    </div>
  );
};
