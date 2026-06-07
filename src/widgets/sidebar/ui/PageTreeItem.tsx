/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeItem.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from "react";
import { ChevronRight, Plus, Folder, FolderOpen, FolderPlus } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import { useShallow } from "zustand/react/shallow";
import { usePageStore, type PageEntry } from "@/store/usePageStore";
import { PageOptionsMenu } from "@/features/page-management";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import { isFolderEntry, selectChildPageIds, selectPageTreeEntry } from "./pageTreeItem.helpers";
import { SidebarRenameInput } from "./SidebarRenameInput";

const EMPTY_WORKSPACE_PAGES: readonly PageEntry[] = [];

interface Props {
  pageId: string;
  workspaceId: string;
  jwt: string;
  depth?: number;
  activeId?: string | null;
}

/**
 * Recursive page-tree row.
 * – A "folder" (surface === "folder") groups children and is a graph hub: clicking it
 *   toggles expand/collapse and NEVER opens a page; files inside open as usual.
 * – Folders are always expandable (so an empty folder can be opened to add into it).
 * – Hover reveals ⋯ (actions), folder+ (new folder inside) and + (new file inside).
 */
export const PageTreeItem: React.FC<Props> = ({ pageId, workspaceId, jwt, depth = 0, activeId }) => {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);
  const updatePageTitle = usePageStore((s) => s.updatePageTitle);
  const page = usePageStore(useShallow((s) => selectPageTreeEntry(s, pageId)));
  const childPageIds = usePageStore(useShallow((s) => selectChildPageIds(s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES, pageId)));
  const accessContext = usePageAccessContext();

  const children = useMemo(() => childPageIds, [childPageIds]);
  if (!page || page.archivedAt || !canReadPage(page, accessContext)) return null;
  const pageEntry = page;

  const isFolder = isFolderEntry(pageEntry);
  const isActive = activeId === pageEntry._id;
  const hasChildren = children.length > 0;
  const canExpand = hasChildren || isFolder; // folders stay expandable even when empty
  const paddingLeft = `calc(var(--osio-space-2) + ${depth} * var(--osio-space-4))`;
  const fallbackIcon = pageEntry.databaseId ? "icon:table" : "icon:page";

  function handleRowClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isFolder) {
      setExpanded((o) => !o); // a folder never opens a page — it expands/collapses
      return;
    }
    openPage({
      id: pageEntry._id,
      workspaceId,
      kind: pageEntry.databaseId ? "database" : "page",
      title: pageEntry.title,
      icon: pageEntry.icon,
      databaseId: pageEntry.databaseId,
    });
  }

  async function createChild(asFolder: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    const title = asFolder ? "New folder" : "Untitled";
    const child = await addPage(workspaceId, title, jwt, pageEntry._id, asFolder ? { surface: "folder" } : undefined);
    if (!child) return;
    setExpanded(true);
    if (!asFolder) {
      openPage({ id: child._id, workspaceId, kind: "page", title: child.title }); // folders don't open
    }
  }

  function renderRowIcon() {
    if (isFolder) {
      return expanded
        ? <FolderOpen size={14} className="shrink-0 text-[var(--osio-accent)]" />
        : <Folder size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />;
    }
    return pageEntry.icon
      ? <AssetRenderer value={pageEntry.icon} size={14} className="shrink-0" />
      : <AssetRenderer value={fallbackIcon} size={13} className="opacity-40 shrink-0" />;
  }

  return (
    <>
      <div
        className="group relative w-full flex items-center gap-0.5 h-7 rounded-md text-sm select-none"
        style={{ paddingLeft, paddingRight: "var(--osio-space-1)" }}
      >
        {canExpand ? (
          <button
            type="button"
            className="flex items-center justify-center w-5 h-5 shrink-0 rounded hover:bg-[var(--osio-bg-hover)]"
            onClick={(e) => { e.stopPropagation(); setExpanded((o) => !o); }}
          >
            <ChevronRight size={12} className={["transition-transform duration-150", expanded ? "rotate-90" : ""].join(" ")} />
          </button>
        ) : (
          <span className="flex items-center justify-center w-5 h-5 shrink-0">
            <AssetRenderer value={fallbackIcon} size={13} className="opacity-50" />
          </span>
        )}

        {renaming ? (
          <SidebarRenameInput
            initialValue={pageEntry.title || ""}
            onCommit={(value) => {
              if (value) updatePageTitle(pageEntry._id, value);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={handleRowClick}
            onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
            title="Double-click to rename"
            className={[
              "flex min-w-0 flex-1 items-center gap-0.5 h-full rounded-md text-sm text-left transition-colors duration-100 pr-20",
              isActive
                ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
                : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
            ].join(" ")}
          >
            {renderRowIcon()}
            <span className="flex-1 text-left truncate ml-1">{pageEntry.title || "Untitled"}</span>
          </button>
        )}

        {/* Action buttons — appear on hover */}
        <span
          className={[
            "absolute right-0 flex items-center gap-0.5 mr-0.5 shrink-0 h-full transition-opacity",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          ].join(" ")}
        >
          <PageOptionsMenu
            pageId={pageEntry._id}
            workspaceId={workspaceId}
            pageTitle={pageEntry.title || "Untitled"}
            isActivePage={isActive}
            onRedirectHome={() => usePageStore.setState({ activePage: null, navigationPath: [] })}
          />
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--osio-bg-subtle)]"
            onClick={(e) => createChild(true, e)}
            title="New folder inside"
          >
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--osio-bg-subtle)]"
            onClick={(e) => createChild(false, e)}
            title="New file inside"
          >
            <Plus size={13} />
          </button>
        </span>
      </div>

      {/* Recurse for children */}
      {expanded && hasChildren &&
        children.map((childId) => (
          <PageTreeItem
            key={childId}
            pageId={childId}
            workspaceId={workspaceId}
            jwt={jwt}
            depth={depth + 1}
            activeId={activeId}
          />
        ))}
    </>
  );
};
