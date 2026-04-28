/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MovePageModal.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 20:16:50 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 20:16:51 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo, useCallback } from "react";
import { Search, X, FileText, ChevronRight, Hash } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { isValidMove } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page";

import styles from "./MovePageModal.module.scss";

interface Props {
  sourcePageId: string;
  onClose: () => void;
}

interface RenderableItem {
  id: string | null;
  workspaceId: string;
  title: string;
  type: "page" | "root";
  depth?: number;
  icon?: string;
  hasChildren?: boolean;
  breadcrumbs?: string;
}

function buildMovePageItems(
  pages: Record<string, PageEntry[]>,
  workspaces: Array<{ _id: string; name: string }>,
  sourcePageId: string,
  privateWorkspaceIds: string[],
  sourceOwnerId: string | null | undefined,
  currentUserId: string,
): RenderableItem[] {
  const items: RenderableItem[] = [];

  const recurse = (
    workspaceId: string,
    parentId: string | null = null,
    depth = 0,
  ) => {
    const wsPages = pages[workspaceId] ?? [];
    const children = wsPages.filter((p) => p.parentPageId === parentId);

    children.forEach((page) => {
      if (
        page._id === sourcePageId ||
        !isValidMove(pages, sourcePageId, page._id)
      ) {
        return;
      }

      const hasChildren = wsPages.some((p) => p.parentPageId === page._id);
      items.push({
        id: page._id,
        workspaceId,
        title: page.title || "Untitled",
        type: "page",
        depth,
        icon: page.icon,
        hasChildren,
      });

      recurse(workspaceId, page._id, depth + 1);
    });
  };

  workspaces.forEach((ws) => {
    // Hide private workspace roots when the page isn't owned by current user
    const isPrivate = privateWorkspaceIds.includes(ws._id);
    if (isPrivate && sourceOwnerId && sourceOwnerId !== currentUserId) {
      return;
    }

    items.push({
      id: null,
      workspaceId: ws._id,
      title: `Move to ${ws.name} Root`,
      type: "root",
      depth: 0,
    });
    recurse(ws._id);
  });

  return items;
}

export const MovePageModal: React.FC<Props> = ({ sourcePageId, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  /* ── Store Selectors (Stable) ──────────────────────────────────── */
  const pages = usePageStore((s) => s.pages);
  const movePage = usePageStore((s) => s.movePage);

  const activeUserId = useUserStore((s) => s.activeUserId);
  const sessions = useUserStore((s) => s.sessions);
  const session = sessions[activeUserId];

  /* ── Derived Data (Memoized) ───────────────────────────────────── */
  const allPages = useMemo(() => Object.values(pages).flat(), [pages]);

  const sourcePage = useMemo(
    () => allPages.find((p) => p._id === sourcePageId),
    [allPages, sourcePageId],
  );

  const workspaces = useMemo(() => {
    if (!session) return [];
    return [...session.privateWorkspaces, ...session.sharedWorkspaces];
  }, [session]);

  const privateWorkspaceIds = useMemo(
    () => session?.privateWorkspaces.map((w) => w._id) ?? [],
    [session],
  );

  // REPLACE the existing getTreeItems (near the bottom of the derived data section):
  const getTreeItems = useMemo(
    () =>
      buildMovePageItems(
        pages,
        workspaces,
        sourcePageId,
        privateWorkspaceIds,
        sourcePage?.ownerId,
        activeUserId,
      ),
    [pages, workspaces, sourcePageId, privateWorkspaceIds, sourcePage?.ownerId, activeUserId],
  );

  const handleMove = useCallback(
    (targetParentId: string | null, targetWorkspaceId: string) => {
      // Prevent non-owners from moving to private workspaces
      const isTargetPrivate = session?.privateWorkspaces.some(
        (w) => w._id === targetWorkspaceId,
      );
      if (
        isTargetPrivate &&
        sourcePage?.ownerId &&
        sourcePage.ownerId !== activeUserId
      ) {
        console.warn(
          "[MovePageModal] Cannot move another user's page to your private workspace. Use Duplicate instead.",
        );
        return;
      }

      const targetWorkspace = workspaces.find(
        (w) => w._id === targetWorkspaceId,
      );
      const targetParent = targetParentId
        ? allPages.find((p) => p._id === targetParentId)
        : null;
      const targetName = targetParent
        ? targetParent.title
        : (targetWorkspace?.name ?? "Root");

      console.log(
        `[MovePageModal] Moved '${sourcePage?.title}' to '${targetName}'`,
      );
      movePage(sourcePageId, targetParentId, targetWorkspaceId);
      onClose();
    },
    [allPages, movePage, onClose, sourcePageId, sourcePage, workspaces, session, activeUserId],
  );

  const buildBreadcrumbs = useCallback(
    (pageId: string, workspaceId: string) => {
      const path: string[] = [];
      let currentId: string | null | undefined = pageId;

      while (currentId) {
        const page = allPages.find((p) => p._id === currentId);
        if (page) {
          path.unshift(page.title || "Untitled");
          currentId = page.parentPageId;
        } else {
          currentId = null;
        }
      }

      const ws = workspaces.find((w) => w._id === workspaceId);
      if (ws) path.unshift(ws.name);

      return path.join(" / ");
    },
    [allPages, workspaces],
  );

  const getFilteredPages = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return allPages
      .filter((p) => {
        if (p._id === sourcePageId) return false;
        if (!isValidMove(pages, sourcePageId, p._id)) return false;
        return (p.title || "").toLowerCase().includes(searchTerm.toLowerCase());
      })
      .map((p) => ({
        id: p._id,
        workspaceId: p.workspaceId,
        title: p.title || "Untitled",
        type: "page" as const,
        icon: p.icon,
        breadcrumbs: buildBreadcrumbs(p._id, p.workspaceId),
      }));
  }, [allPages, searchTerm, sourcePageId, pages, buildBreadcrumbs]);

  const renderableItems = searchTerm.trim() ? getFilteredPages : getTreeItems;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, renderableItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const activeItem = renderableItems[activeIndex];
      if (activeItem) {
        handleMove(activeItem.id, activeItem.workspaceId);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setActiveIndex(0);
  };

  return (
    <>
      <button
        type="button"
        className={styles.overlay}
        aria-label="Close move page modal"
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 101,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div className={styles.modal} style={{ pointerEvents: "auto" }}>
          {/* Header / Search */}
          <div className={styles.header}>
            <Search size={16} className={styles.searchIcon} />
            <input
              autoFocus
              className={styles.searchInput}
              placeholder="Search for a page to move to..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={onClose}
              className={styles.closeButton}
            >
              <X size={16} />
            </button>
          </div>

          {/* List Area */}
          <div className={styles.scrollArea}>
            {searchTerm.trim() ? (
              <>
                <div className={styles.sectionLabel}>Search Results</div>
                {getFilteredPages.length > 0 ? (
                  getFilteredPages.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.listItem} ${idx === activeIndex ? styles.focused : ""}`}
                      onClick={() => handleMove(item.id, item.workspaceId)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <span className={styles.itemIcon}>
                        {item.icon ? (
                          <span>{item.icon}</span>
                        ) : (
                          <FileText size={14} />
                        )}
                      </span>
                      <div className="flex flex-col overflow-hidden">
                        <span className={styles.itemTitle}>{item.title}</span>
                        <span className={styles.breadcrumbs}>
                          {item.breadcrumbs}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    No pages found matching &quot;{searchTerm}&quot;
                  </div>
                )}
              </>
            ) : (
              workspaces.map((ws) => {
                const wsItems = getTreeItems.filter(
                  (item) => item.workspaceId === ws._id,
                );
                return (
                  <div key={ws._id} className="mb-4">
                    <div className={styles.sectionLabel}>{ws.name}</div>
                    {wsItems.map((item) => {
                      const globalIdx = getTreeItems.indexOf(item);
                      return (
                        <button
                          key={`${item.workspaceId}-${item.id || "root"}`}
                          type="button"
                          className={`${styles.listItem} ${globalIdx === activeIndex ? styles.focused : ""}`}
                          style={{
                            paddingLeft: `${(item.depth! + 1) * 1.5}rem`,
                          }}
                          onClick={() => handleMove(item.id, item.workspaceId)}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                        >
                          <span className={styles.itemIcon}>
                            {(() => {
                              if (item.type === "root") {
                                return (
                                  <Hash
                                    size={14}
                                    className="text-[var(--color-ink-faint)]"
                                  />
                                );
                              }

                              if (item.icon) {
                                return <span>{item.icon}</span>;
                              }

                              return <FileText size={14} />;
                            })()}
                          </span>
                          <span className={styles.itemTitle}>{item.title}</span>
                          {item.hasChildren && (
                            <ChevronRight
                              size={12}
                              className="text-[var(--color-ink-faint)]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
};
