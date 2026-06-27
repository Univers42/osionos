/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeWorkspaceParts.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
// Deep paths, NOT the `@/widgets/database-view` barrel: this file is reached
// WARM (FilesPanel → FolderRail) and the barrel statically pulls DatabaseBlock +
// WorkspaceDatabaseBlock (→ the editor) + dataSourceProvider (→ the ~458KB seed
// JSON) onto the entry chunk. workspaceNav is zustand-only; workspaceDatabasePage
// only touches the page/user stores — both already-warm, editor/JSON-free.
import { useWorkspaceNav } from "@/widgets/database-view/model/workspaceNav";
import { ensureWorkspaceGalleryPage } from "@/widgets/database-view/model/workspaceDatabasePage";

const RAIL_BTN =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] data-[active=true]:bg-[var(--osio-bg-active)] data-[active=true]:font-medium";

/** Left rail listing folders; clicking one scopes the Files gallery to it. */
export const FolderRail: React.FC = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id);
  const pages = usePageStore((state) => (workspaceId ? state.pagesForWorkspace(workspaceId) : []));
  const activeFolderId = useWorkspaceNav((state) => state.activeFolderId);
  const setActiveFolder = useWorkspaceNav((state) => state.setActiveFolder);

  const { folders, counts, total } = React.useMemo(() => {
    const live = pages.filter((page) => !page.archivedAt);
    const counts = new Map<string, number>();
    let total = 0;
    for (const page of live) {
      if (page.surface === "folder" || (page.surface && page.surface !== "page") || page.databaseId) continue;
      total += 1;
      if (page.parentPageId) counts.set(page.parentPageId, (counts.get(page.parentPageId) ?? 0) + 1);
    }
    const folders = live
      .filter((page) => page.surface === "folder")
      .sort((a, b) => a.title.localeCompare(b.title));
    return { folders, counts, total };
  }, [pages]);

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">Folders</span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
          onClick={() => { void ensureWorkspaceGalleryPage(); }}
        >
          Open as page ↗
        </button>
      </div>
      <button type="button" className={RAIL_BTN} data-active={!activeFolderId} onClick={() => setActiveFolder(null)}>
        <span aria-hidden="true">🗂️</span>
        <span className="flex-1 truncate">All files</span>
        <span className="text-xs text-[var(--osio-fg-muted)]">{total}</span>
      </button>
      {folders.map((folder) => (
        <button
          key={folder._id}
          type="button"
          className={RAIL_BTN}
          data-active={activeFolderId === folder._id}
          onClick={() => setActiveFolder(folder._id)}
        >
          <span aria-hidden="true">{folder.icon ?? "📁"}</span>
          <span className="flex-1 truncate">{folder.title}</span>
          <span className="text-xs text-[var(--osio-fg-muted)]">{counts.get(folder._id) ?? 0}</span>
        </button>
      ))}
    </nav>
  );
};
