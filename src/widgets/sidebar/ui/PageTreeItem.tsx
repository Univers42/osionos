/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeItem.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 23:14:06 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import { usePageStore, type PageEntry } from "@/store/usePageStore";
import { PageOptionsMenu } from "@/features/page-management";
import {
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";

const EMPTY_WORKSPACE_PAGES: readonly PageEntry[] = [];

interface Props {
  page: PageEntry;
  workspaceId: string;
  jwt: string;
  depth?: number;
  activeId?: string | null;
}

/**
 * Recursive page tree row.
 * – Indent: depth × 12 px left offset
 * – Hover reveals ⋯ (actions) and + (add child) buttons
 * – Click opens the page in MainContent
 */
export const PageTreeItem: React.FC<Props> = ({
  page,
  workspaceId,
  jwt,
  depth = 0,
  activeId,
}) => {
  const [expanded, setExpanded] = useState(false);

  const openPage = usePageStore((s) => s.openPage);
  const addPage = usePageStore((s) => s.addPage);

  // Access raw pages array (stable reference) and derive children outside selector
  const wsPages = usePageStore(
    (s) => s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES,
  );
  const accessContext = getCurrentPageAccessContext();
  const children = useMemo(
    () =>
      (wsPages ?? []).filter(
        (p) =>
          p.parentPageId === page._id &&
          !p.archivedAt &&
          canReadPage(p, accessContext),
      ),
    [wsPages, page._id, accessContext],
  );
  const isActive = activeId === page._id;
  const hasChildren = children.length > 0;
  const paddingLeft = 10 + depth * 12;

  const fallbackIcon = page.databaseId ? "icon:table" : "icon:page";

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    handleOpenPage();
  }

  function handleOpenPage() {
    openPage({
      id: page._id,
      workspaceId,
      kind: page.databaseId ? "database" : "page",
      title: page.title,
      icon: page.icon,
    });
  }

  async function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = await addPage(workspaceId, "Untitled", jwt, page._id);
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
        style={{ paddingLeft, paddingRight: 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex items-center justify-center w-5 h-5 shrink-0 rounded hover:bg-[var(--color-surface-hover)]"
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
              ? "bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]",
          ].join(" ")}
        >
          {page.icon ? (
            <AssetRenderer value={page.icon} size={14} className="shrink-0" />
          ) : (
            <AssetRenderer
              value={fallbackIcon}
              size={13}
              className="opacity-40 shrink-0"
            />
          )}

          <span className="flex-1 text-left truncate ml-1">
            {page.title || "Untitled"}
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
            pageId={page._id}
            workspaceId={workspaceId}
            pageTitle={page.title || "Untitled"}
            isActivePage={isActive}
            onRedirectHome={() =>
              usePageStore.setState({ activePage: null, navigationPath: [] })
            }
          />
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--color-surface-secondary)]"
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
        children.map((child) => (
          <PageTreeItem
            key={child._id}
            page={child}
            workspaceId={workspaceId}
            jwt={jwt}
            depth={depth + 1}
            activeId={activeId}
          />
        ))}
    </>
  );
};
