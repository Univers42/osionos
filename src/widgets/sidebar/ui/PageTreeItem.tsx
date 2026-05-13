/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeItem.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 16:29:52 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import { useShallow } from "zustand/react/shallow";
import { usePageStore, type PageEntry } from "@/store/usePageStore";
import { PageOptionsMenu } from "@/features/page-management";
import {
  canReadPage,
  usePageAccessContext,
} from "@/shared/lib/auth/pageAccess";

const EMPTY_WORKSPACE_PAGES: readonly PageEntry[] = [];
type PageStoreState = ReturnType<typeof usePageStore.getState>;

function selectPageTreeEntry(state: PageStoreState, pageId: string): PageEntry | null {
  const index = state.pagesIndex[pageId];
  const page = index ? state.pages[index.workspaceId]?.[index.index] : undefined;
  if (!page) return null;
  return {
    _id: page._id,
    title: page.title,
    icon: page.icon,
    workspaceId: page.workspaceId,
    ownerId: page.ownerId,
    visibility: page.visibility,
    collaborators: page.collaborators,
    parentPageId: page.parentPageId,
    databaseId: page.databaseId,
    archivedAt: page.archivedAt,
    surface: page.surface,
  };
}

function selectChildPageIds(pages: readonly PageEntry[], parentPageId: string): string[] {
  return pages
    .filter((page) => page.parentPageId === parentPageId && !page.archivedAt)
    .map((page) => page._id);
}

interface Props {
  pageId: string;
  workspaceId: string;
  jwt: string;
  depth?: number;
  activeId?: string | null;
}

/**
 * Recursive page tree row.
 * – Indent: depth × --osio-space-4 with a --osio-space-2 row gutter
 * – Hover reveals ⋯ (actions) and + (add child) buttons
 * – Click opens the page in MainContent
 */
export const PageTreeItem: React.FC<Props> = ({
  pageId,
  workspaceId,
  jwt,
  depth = 0,
  activeId,
}) => {
  const [expanded, setExpanded] = useState(false);

  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);
  const page = usePageStore(useShallow((s) => selectPageTreeEntry(s, pageId)));
  const childPageIds = usePageStore(useShallow((s) => selectChildPageIds(s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES, pageId)));
  const accessContext = usePageAccessContext();

  const children = useMemo(
    () => childPageIds,
    [childPageIds],
  );
  if (!page || page.archivedAt || !canReadPage(page, accessContext)) return null;
  const pageEntry = page;

  const isActive = activeId === pageEntry._id;
  const hasChildren = children.length > 0;
  const paddingLeft = `calc(var(--osio-space-2) + ${depth} * var(--osio-space-4))`;

  const fallbackIcon = pageEntry.databaseId ? "icon:table" : "icon:page";

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    handleOpenPage();
  }

  function handleOpenPage() {
    openPage({
      id: pageEntry._id,
      workspaceId,
      kind: pageEntry.databaseId ? "database" : "page",
      title: pageEntry.title,
      icon: pageEntry.icon,
      databaseId: pageEntry.databaseId,
    });
  }

  async function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = await addPage(workspaceId, "Untitled", jwt, pageEntry._id);
    if (child) {
      setExpanded(true);
      openPage({
        id: child._id,
        workspaceId,
        kind: "page",
        title: child.title,
      });
    }
  }

  return (
    <>
      <div
        className="group relative w-full flex items-center gap-0.5 h-7 rounded-md text-sm select-none"
        style={{ paddingLeft, paddingRight: "var(--osio-space-1)" }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex items-center justify-center w-5 h-5 shrink-0 rounded hover:bg-[var(--osio-bg-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((o) => !o);
            }}
          >
            <ChevronRight
              size={12}
              className={[
                "transition-transform duration-150",
                expanded ? "rotate-90" : "",
              ].join(" ")}
            />
          </button>
        ) : (
          <span className="flex items-center justify-center w-5 h-5 shrink-0">
            <AssetRenderer
              value={fallbackIcon}
              size={13}
              className="opacity-50"
            />
          </span>
        )}

        <button
          type="button"
          onClick={handleOpen}
          className={[
            "flex min-w-0 flex-1 items-center gap-0.5 h-full rounded-md text-sm text-left transition-colors duration-100 pr-14",
            isActive
              ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
              : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
          ].join(" ")}
        >
          {pageEntry.icon ? (
            <AssetRenderer value={pageEntry.icon} size={14} className="shrink-0" />
          ) : (
            <AssetRenderer
              value={fallbackIcon}
              size={13}
              className="opacity-40 shrink-0"
            />
          )}

          <span className="flex-1 text-left truncate ml-1">
            {pageEntry.title || "Untitled"}
          </span>
        </button>

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
            onRedirectHome={() =>
              usePageStore.setState({ activePage: null, navigationPath: [] })
            }
          />
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--osio-bg-subtle)]"
            onClick={handleAddChild}
            title="Add child page"
          >
            <Plus size={13} />
          </button>
        </span>
      </div>

      {/* Recurse for children */}
      {expanded &&
        hasChildren &&
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
