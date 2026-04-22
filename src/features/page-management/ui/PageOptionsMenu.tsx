import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Trash, Copy, ArrowRight } from "lucide-react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import {
  canDeletePage,
  canDuplicatePage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { MovePageModal } from "./MovePageModal";
import { getAllDescendantIds } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page";

import styles from "./PageOptionsMenu.module.scss";

const EMPTY_WORKSPACE_PAGES: PageEntry[] = [];
const MENU_MARGIN = 12;
const MENU_GAP = 6;

type MenuPosition = {
  top: number;
  left: number;
};

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
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalTarget = globalThis.document?.body ?? null;

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
  const currentPage = usePageStore((s) => s.pageById(pageId));

  const deletePage = usePageStore((s) => s.deletePage);
  const duplicatePage = usePageStore((s) => s.duplicatePage);

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

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const triggerElement = triggerRef.current;
      const menuElement = menuRef.current;

      if (!triggerElement || !menuElement) return;

      const triggerRect = triggerElement.getBoundingClientRect();
      const menuRect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const left = Math.max(
        MENU_MARGIN,
        Math.min(
          triggerRect.right - menuRect.width,
          viewportWidth - menuRect.width - MENU_MARGIN,
        ),
      );

      const spaceBelow =
        viewportHeight - triggerRect.bottom - MENU_GAP - MENU_MARGIN;
      const spaceAbove = triggerRect.top - MENU_GAP - MENU_MARGIN;
      const openAbove = spaceBelow < menuRect.height && spaceAbove > spaceBelow;

      const top = openAbove
        ? Math.max(MENU_MARGIN, triggerRect.top - menuRect.height - MENU_GAP)
        : Math.min(
            triggerRect.bottom + MENU_GAP,
            viewportHeight - menuRect.height - MENU_MARGIN,
          );

      setMenuPosition({ top, left });
    };

    updateMenuPosition();

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsMoveModalOpen(true);
  };

  const handleDuplicateClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (!workspaceId) return;
    if (
      !currentPage ||
      !canDuplicatePage(currentPage, getCurrentPageAccessContext())
    )
      return;

    try {
      await duplicatePage(pageId, workspaceId);
    } catch (err) {
      console.error("[PageOptionsMenu] Failed to duplicate page", err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!workspaceId) {
      console.error("[PageOptionsMenu] Missing workspaceId for deletion", {
        workspaceId,
      });
      setIsModalOpen(false);
      return;
    }

    if (
      !currentPage ||
      !canDeletePage(currentPage, getCurrentPageAccessContext())
    ) {
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
    <div className="relative flex items-center" ref={triggerRef}>
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

      {isMenuOpen &&
        portalTarget &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.dropdown}
            style={{
              top: menuPosition?.top ?? 0,
              left: menuPosition?.left ?? 0,
              visibility: menuPosition ? "visible" : "hidden",
            }}
          >
            <button
              type="button"
              className={styles.menuItem}
              onClick={handleDuplicateClick}
            >
              <Copy size={14} className="shrink-0" />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              className={styles.menuItem}
              onClick={handleMoveClick}
            >
              <ArrowRight size={14} className="shrink-0" />
              <span>Move to</span>
            </button>

            <button
              type="button"
              className={[styles.menuItem, styles.danger].join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(e);
              }}
            >
              <Trash size={14} className="shrink-0" />
              <span>Move to Trash</span>
            </button>
          </div>,
          portalTarget,
        )}

      {isModalOpen &&
        portalTarget &&
        createPortal(
          <ConfirmDeleteModal
            title={pageTitle}
            subPageCount={subPageCount}
            onConfirm={handleConfirmDelete}
            onCancel={() => setIsModalOpen(false)}
          />,
          portalTarget,
        )}

      {isMoveModalOpen &&
        portalTarget &&
        createPortal(
          <MovePageModal
            sourcePageId={pageId}
            onClose={() => setIsMoveModalOpen(false)}
          />,
          portalTarget,
        )}
    </div>
  );
};
