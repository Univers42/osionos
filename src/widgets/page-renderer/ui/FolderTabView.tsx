/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   FolderTabView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Folder, ChevronRight } from "lucide-react";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useShallow } from "zustand/react/shallow";
import { usePageStore, type PageEntry } from "@/store/usePageStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

type FolderChild = Pick<PageEntry, "_id" | "title" | "icon" | "surface" | "databaseId" | "workspaceId">;

function sortChildren(children: FolderChild[]): FolderChild[] {
  return [...children].sort((a, b) => {
    const aFolder = a.surface === "folder" ? 0 : 1;
    const bFolder = b.surface === "folder" ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return (a.title || "").localeCompare(b.title || "");
  });
}

/** A folder "tab": a readable listing of its children — click one to open it here. */
export const FolderTabView: React.FC<{ tab: WorkspaceTab; paneId?: string }> = ({ tab, paneId }) => {
  const folder = usePageStore((s) => s.pageById(tab.pageId));
  const children = usePageStore(useShallow((s) => (
    (s.pages[tab.workspaceId] ?? [])
      .filter((p) => p.parentPageId === tab.pageId && !p.archivedAt)
      .map((p) => ({ _id: p._id, title: p.title, icon: p.icon, surface: p.surface, databaseId: p.databaseId, workspaceId: p.workspaceId }))
  )));
  const openTab = useWorkspaceLayout((s) => s.openTab);
  const sorted = sortChildren(children);

  return (
    <div className="h-full overflow-auto bg-[var(--osio-bg-page)]">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="mb-6 flex items-center gap-2">
          <Folder size={22} className="shrink-0 text-[var(--osio-accent)]" />
          <h1 className="truncate text-2xl font-semibold text-[var(--osio-fg-default)]">{folder?.title || tab.title || "Folder"}</h1>
          <span className="ml-1 shrink-0 text-sm text-[var(--osio-fg-subtle)]">{sorted.length} item{sorted.length === 1 ? "" : "s"}</span>
        </header>

        {sorted.length === 0 ? (
          <p className="text-sm italic text-[var(--osio-fg-subtle)]">This folder is empty.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sorted.map((child) => (
              <li key={child._id}>
                <button
                  type="button"
                  onClick={() => openTab(pageEntryToTab(child), paneId)}
                  className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
                >
                  {child.surface === "folder"
                    ? <Folder size={16} className="shrink-0 text-[var(--osio-fg-muted)]" />
                    : <IconValueView value={child.icon ?? (child.databaseId ? "icon:table" : "icon:page")} size={16} className="shrink-0" />}
                  <span className="flex-1 truncate">{child.title || "Untitled"}</span>
                  <ChevronRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
