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

import React, { useState, useMemo, useCallback, useRef } from "react";
import { Search, X, FileText, ChevronRight, Hash } from "lucide-react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { IconButton, Input, Modal, PanelSectionLabel } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { isValidMove } from "@/store/pageStore.helpers";
import { buildMoveBreadcrumbs } from "../model/moveBreadcrumbs";
import { buildMovePageItems, type RenderableItem } from "../model/moveTree";

interface Props {
  sourcePageId: string;
  onClose: () => void;
}

// A search result carries its breadcrumb on a second line, so its row grows past the
// menu row's fixed height; inline because two height utilities settle by stylesheet order.
const TWO_LINE_ROW = { height: "auto", minHeight: "var(--osio-control-h-md)", paddingBlock: "var(--osio-space-1)" } as const;

const PageGlyph: React.FC<{ item: RenderableItem }> = ({ item }) => {
  if (item.type === "root") return <Hash size={14} aria-hidden className="text-[var(--osio-fg-subtle)]" />;
  if (item.icon) return <IconValueView value={item.icon} size={14} />;
  return <FileText size={14} aria-hidden />;
};

export const MovePageModal: React.FC<Props> = ({ sourcePageId, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

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
    (pageId: string, workspaceId: string) =>
      buildMoveBreadcrumbs(pageId, workspaceId, allPages, workspaces),
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
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setActiveIndex(0);
  };

  return (
    <Modal open onClose={onClose} title="Move page" size="sm" initialFocusRef={searchRef as React.RefObject<HTMLElement>}>
      <div className="flex max-h-[80vh] flex-col">
        <div className="relative border-b border-[var(--osio-border-default)] p-3">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[var(--osio-fg-subtle)]" />
          <Input
            ref={searchRef}
            className="pl-9 pr-9"
            placeholder="Search for a page to move to..."
            aria-label="Search for a page to move to"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
          <IconButton label="Close" size="xs" onClick={onClose} className="absolute right-5 top-1/2 -translate-y-1/2">
            <X size={14} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {searchTerm.trim() ? (
            <>
              <PanelSectionLabel className="px-2 pb-1 pt-2">Search results</PanelSectionLabel>
              {getFilteredPages.length > 0 ? (
                getFilteredPages.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className="osio-menu-item"
                    style={TWO_LINE_ROW}
                    data-active={idx === activeIndex}
                    onClick={() => handleMove(item.id, item.workspaceId)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <PageGlyph item={item} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.title}</span>
                      <span className="truncate text-xs text-[var(--osio-fg-subtle)]">{item.breadcrumbs}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-8 text-center text-sm text-[var(--osio-fg-muted)]">
                  No pages found matching &quot;{searchTerm}&quot;
                </p>
              )}
            </>
          ) : (
            workspaces.map((ws) => (
              <div key={ws._id} className="mb-2">
                <PanelSectionLabel className="px-2 pb-1 pt-2">{ws.name}</PanelSectionLabel>
                {getTreeItems.filter((item) => item.workspaceId === ws._id).map((item) => {
                  const globalIdx = getTreeItems.indexOf(item);
                  return (
                    <button
                      key={`${item.workspaceId}-${item.id || "root"}`}
                      type="button"
                      className="osio-menu-item"
                      data-active={globalIdx === activeIndex}
                      style={{ paddingLeft: `calc(var(--osio-space-2) + ${item.depth ?? 0} * var(--osio-space-4))` }}
                      onClick={() => handleMove(item.id, item.workspaceId)}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                    >
                      <PageGlyph item={item} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.hasChildren && <ChevronRight size={12} aria-hidden className="text-[var(--osio-fg-subtle)]" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
