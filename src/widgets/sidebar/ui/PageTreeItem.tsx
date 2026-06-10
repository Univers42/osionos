/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeItem.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { BookOpen, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useShallow } from "zustand/react/shallow";
import { usePageStore, type PageEntry } from "@/store/usePageStore";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import { isFolderEntry, isWikiEntry, selectChildPageIds, selectPageTreeEntry } from "./pageTreeItem.helpers";
import { SidebarRenameInput } from "./SidebarRenameInput";
import { PageTreeRowActions } from "./PageTreeRowActions";
import { usePageRowDnd } from "./usePageRowDnd";
import { useSidebarTreeDnd } from "../model/sidebarTreeDnd";

const EMPTY_WORKSPACE_PAGES: readonly PageEntry[] = [];

interface Props {
  pageId: string;
  workspaceId: string;
  jwt: string;
  depth?: number;
  activeId?: string | null;
}

/**
 * Recursive page-tree row with drag-and-drop reparenting.
 * – A "folder" (surface === "folder") toggles expand/collapse and NEVER opens.
 * – Drag a row onto another: dropping on its middle nests it as a child; dropping
 *   on the top/bottom edge keeps it at the same depth (sibling, blue line).
 * – Hovering a collapsed folder mid-drag springs it open after a short dwell.
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
  const collapseToken = useSidebarTreeDnd((s) => s.collapseToken);

  const children = useMemo(() => childPageIds, [childPageIds]);
  // Render-adjust: collapse in the SAME pass the broadcast token changes —
  // a sync setState inside an effect cascades an extra render per node.
  const [seenCollapseToken, setSeenCollapseToken] = useState(collapseToken);
  if (seenCollapseToken !== collapseToken) {
    setSeenCollapseToken(collapseToken);
    setExpanded(false);
  }

  const isFolder = page ? isFolderEntry(page) : false;
  const isWiki = page ? isWikiEntry(page) : false;
  const hasChildren = children.length > 0;
  const canExpand = hasChildren || isFolder || isWiki;
  const { isDragging, indicator, dragHandlers, dropHandlers } = usePageRowDnd({
    pageId,
    parentPageId: page?.parentPageId,
    workspaceId,
    canExpand,
    expanded,
    onSpringOpen: () => setExpanded(true),
  });

  if (!page || page.archivedAt || !canReadPage(page, accessContext)) return null;
  const pageEntry = page;
  const isActive = activeId === pageEntry._id;
  const paddingLeft = `calc(var(--osio-space-2) + ${depth} * var(--osio-space-4))`;
  const fallbackIcon = pageEntry.databaseId ? "icon:table" : "icon:page";

  function handleRowClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isFolder) { setExpanded((o) => !o); return; }
    openPage({
      id: pageEntry._id, workspaceId,
      kind: pageEntry.databaseId ? "database" : "page",
      title: pageEntry.title, icon: pageEntry.icon, databaseId: pageEntry.databaseId,
    });
  }

  async function createChild(asFolder: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    const title = asFolder ? "New folder" : "Untitled";
    const child = await addPage(workspaceId, title, jwt, pageEntry._id, asFolder ? { surface: "folder" } : undefined);
    if (!child) return;
    setExpanded(true);
    if (!asFolder) openPage({ id: child._id, workspaceId, kind: "page", title: child.title });
  }

  function renderRowIcon() {
    if (isFolder) {
      return expanded
        ? <FolderOpen size={14} className="shrink-0 text-[var(--osio-accent)]" />
        : <Folder size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />;
    }
    if (isWiki) return <BookOpen size={14} className="shrink-0 text-[var(--osio-accent)]" />;
    return pageEntry.icon
      ? <IconValueView value={pageEntry.icon} size={14} className="shrink-0" />
      : <IconValueView value={fallbackIcon} size={13} className="opacity-40 shrink-0" />;
  }

  return (
    <>
      <div
        className={[
          "group relative w-full flex items-center gap-0.5 h-7 rounded-md text-sm select-none",
          isDragging ? "opacity-40" : "",
          indicator === "inside" ? "bg-[var(--osio-accent)]/10 ring-1 ring-inset ring-[var(--osio-accent)]/40" : "",
        ].join(" ")}
        style={{ paddingLeft, paddingRight: "var(--osio-space-1)" }}
        {...dropHandlers}
      >
        {indicator === "before" && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-[var(--osio-accent)]" />}
        {indicator === "after" && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-[var(--osio-accent)]" />}

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
            <IconValueView value={fallbackIcon} size={13} className="opacity-50" />
          </span>
        )}

        {renaming ? (
          <SidebarRenameInput
            initialValue={pageEntry.title || ""}
            onCommit={(value) => { if (value) updatePageTitle(pageEntry._id, value); setRenaming(false); }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            {...dragHandlers}
            onClick={handleRowClick}
            onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
            title="Double-click to rename · drag to move"
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

        <PageTreeRowActions
          pageId={pageEntry._id}
          workspaceId={workspaceId}
          title={pageEntry.title || "Untitled"}
          isActive={isActive}
          onNewFolder={(e) => createChild(true, e)}
          onNewFile={(e) => createChild(false, e)}
        />
      </div>

      {expanded && hasChildren &&
        children.map((childId) => (
          <PageTreeItem key={childId} pageId={childId} workspaceId={workspaceId} jwt={jwt} depth={depth + 1} activeId={activeId} />
        ))}
    </>
  );
};
