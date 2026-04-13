import React, { useState, useRef, useEffect, useMemo } from "react";
import { MoreHorizontal, Trash } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { getAllDescendantIds } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page";

import styles from "./PageOptionsMenu.module.scss";

const EMPTY_WORKSPACE_PAGES: PageEntry[] = [];

interface Props {
  pageId: string;
  pageTitle: string;
  isActivePage: boolean;
  workspaceId?: string;
  onRedirectHome: () => void;
}

export const PageOptionsMenu: React.FC<Props> = ({
  pageId,
  pageTitle,
  isActivePage: _isActivePage, // We'll compute this based on store state for safety
  workspaceId: providedWorkspaceId,
  onRedirectHome,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const jwt = useUserStore((s) => s.activeJwt());
  const activePageId = usePageStore((s) => s.activePage?.id);

  const storeWorkspaceId = usePageStore((s) =>
    Object.keys(s.pages).find((wsId) =>
      s.pages[wsId].some((p) => p._id === pageId),
    ),
  );

  const workspaceId = providedWorkspaceId || storeWorkspaceId;
  const wsPages = usePageStore((s) =>
    workspaceId
      ? (s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES)
      : EMPTY_WORKSPACE_PAGES,
  );

  const deletePage = usePageStore((s) => s.deletePage);

  // Memoize counts and descendants to avoid tree traversal on every render
  const { descendantIds, subPageCount } = useMemo(() => {
    if (!wsPages || !pageId) return { descendantIds: [], subPageCount: 0 };
    const ids = getAllDescendantIds(wsPages, pageId);
    return { descendantIds: ids, subPageCount: ids.length };
  }, [wsPages, pageId]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMenuOpen]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!workspaceId) {
      console.error("[PageOptionsMenu] Missing workspaceId for deletion", {
        workspaceId,
      });
      setIsModalOpen(false);
      return;
    }

    try {
      // Perform the deletion
      await deletePage(pageId, workspaceId, jwt ?? "");

      // Safety: If the deleted page OR any of its sub-pages was active, redirect home
      const isDeletedActive =
        activePageId === pageId || descendantIds.includes(activePageId!);
      if (isDeletedActive) {
        onRedirectHome();
      }
    } catch (err) {
      console.error("[PageOptionsMenu] Failed to delete page", err);
    } finally {
      setIsModalOpen(false);
    }
  };

  return (
    <div className="relative flex items-center" ref={menuRef}>
      <button
        type="button"
        className={[
          "p-1 rounded transition-colors",
          isMenuOpen
            ? "bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]"
            : "hover:bg-[var(--color-surface-secondary)]",
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          setIsMenuOpen(!isMenuOpen);
        }}
        title="Page options"
      >
        <MoreHorizontal size={13} />
      </button>

      {isMenuOpen && (
        <div className={styles.dropdown}>
          <button
            type="button"
            className={[styles.menuItem, styles.danger].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(e);
            }}
          >
            <Trash size={14} className="shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {isModalOpen && (
        <ConfirmDeleteModal
          title={pageTitle}
          subPageCount={subPageCount}
          onConfirm={handleConfirmDelete}
          onCancel={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
