/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageOptionsPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  BookOpen,
  Bug,
  Check,
  Copy,
  ArrowRight,
  Trash2,
  Folder,
  FileDown,
  FileText,
} from "lucide-react";
import {
  clampTriggerAlignedMenuPosition,
  useClickOutside,
} from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import {
  canDeletePage,
  canDuplicatePage,
  canEditPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { MovePageModal } from "./MovePageModal";
import { PAGE_DEBUG_TOOLS, usePageDebugStore } from "@/shared/debug/pageDebugStore";
import { getAllDescendantIds } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page";

import { MENU_PANEL_CLASS, MENU_ROW_CLASS } from "./menuChrome";

const EMPTY_WORKSPACE_PAGES: PageEntry[] = [];
const MENU_MARGIN = 12;
const MENU_GAP = 6;

// Lazy: the whole export machinery (serializers, zip, dialog) loads only when
// the user actually opens Export — it has no place in the sidebar warm chunk.
const ExportDialog = React.lazy(() =>
  import("@/features/page-export/ui/ExportDialog").then((module) => ({
    default: module.ExportDialog,
  })),
);

type MenuPosition = {
  top: number;
  left: number;
};

/** What the options trigger has open: its menu or one of the dialogs the menu leads to. */
export type PageOptionsSurface = "menu" | "archive" | "delete" | "move" | "export";

interface Props {
  pageId: string;
  pageTitle: string;
  workspaceId?: string;
  onRedirectHome: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  open: PageOptionsSurface;
  setOpen: (surface: PageOptionsSurface | null) => void;
}

/** The open half of PageOptionsMenu: the menu and its dialogs, with every store
 *  subscription they need. Mounted only while something is open. */
export const PageOptionsPanel: React.FC<Props> = ({
  pageId,
  pageTitle,
  workspaceId: providedWorkspaceId,
  onRedirectHome,
  triggerRef,
  open,
  setOpen,
}) => {
  const isMenuOpen = open === "menu";
  const confirmationMode = open === "archive" || open === "delete" ? open : null;
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBoundaryRefs = useMemo(() => [triggerRef, menuRef] as const, [triggerRef]);

  const portalTarget = globalThis.document?.body ?? null;

  const jwt = useUserStore((s) => s.activePageJwt());
  const activePageId = usePageStore((s) => s.activePage?.id);
  const debugToolsEnabled = usePageDebugStore((s) => s.enabled);
  const toggleDebugTool = usePageDebugStore((s) => s.toggle);

  const storeWorkspaceId = usePageStore((s) => s.pagesIndex[pageId]?.workspaceId);

  const workspaceId = providedWorkspaceId || storeWorkspaceId;
  // Descendants only feed the archive/delete confirmation, so the array is read only then.
  const wsPages = usePageStore((s) =>
    confirmationMode && workspaceId
      ? (s.pages[workspaceId] ?? EMPTY_WORKSPACE_PAGES)
      : EMPTY_WORKSPACE_PAGES,
  );
  const currentPage = usePageStore((s) => s.pageById(pageId));

  const archivePage = usePageStore((s) => s.archivePage);
  const deletePage = usePageStore((s) => s.deletePage);
  const duplicatePage = usePageStore((s) => s.duplicatePage);
  const patchPage = usePageStore((s) => s.patchPage);
  const isFolder = currentPage?.surface === "folder";
  const isWiki = currentPage?.surface === "wiki";

  // Memoize counts and descendants to avoid tree traversal on every render
  const { descendantIds, subPageCount } = useMemo(() => {
    if (!wsPages || !pageId) return { descendantIds: [], subPageCount: 0 };
    const ids = getAllDescendantIds(wsPages, pageId);
    return { descendantIds: ids, subPageCount: ids.length };
  }, [wsPages, pageId]);

  const closeMenu = useCallback(() => setOpen(null), [setOpen]);

  useClickOutside(menuBoundaryRefs, closeMenu, isMenuOpen);

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

      setMenuPosition(
        clampTriggerAlignedMenuPosition(triggerRect, menuRect, {
          align: "end",
          gap: MENU_GAP,
          margin: MENU_MARGIN,
        }),
      );
    };

    updateMenuPosition();

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen, triggerRef]);

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen("archive");
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen("delete");
  };

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen("move");
  };

  const handleConvertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(null);
    // A folder is a normal page flagged surface:"folder" (it groups children and never opens).
    // Converting back to a page clears the flag; existing children/content are preserved.
    patchPage(pageId, { surface: isFolder ? undefined : "folder" });
  };

  const handleConvertWikiClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(null);
    // A wiki is a governed knowledge root (surface:"wiki"): it groups children like a
    // folder but opens onto its own index content. Converting back clears the flag.
    patchPage(pageId, { surface: isWiki ? undefined : "wiki" });
  };

  const handleDuplicateClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(null);
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

  const closeConfirmation = () => setOpen(null);

  const redirectIfAffectedPageChanged = () => {
    const isAffectedActive =
      activePageId === pageId ||
      (activePageId ? descendantIds.includes(activePageId) : false);

    if (isAffectedActive) {
      onRedirectHome();
    }
  };

  const handleConfirmArchive = async () => {
    if (!workspaceId) {
      console.error("[PageOptionsMenu] Missing workspaceId for archive", {
        workspaceId,
      });
      closeConfirmation();
      return;
    }

    if (
      !currentPage ||
      // "Move to Trash" only PATCHes archived_at, so it asks 'update' like the store's
      // archive does — an editor without 'delete' still trashes a page.
      !canEditPage(currentPage, getCurrentPageAccessContext())
    ) {
      closeConfirmation();
      return;
    }

    try {
      await archivePage(pageId, workspaceId, jwt ?? "");
      redirectIfAffectedPageChanged();
    } catch (err) {
      console.error("[PageOptionsMenu] Failed to archive page", err);
    } finally {
      closeConfirmation();
    }
  };

  const handleConfirmDelete = async () => {
    if (!workspaceId) {
      console.error("[PageOptionsMenu] Missing workspaceId for deletion", {
        workspaceId,
      });
      closeConfirmation();
      return;
    }

    if (
      !currentPage ||
      !canDeletePage(currentPage, getCurrentPageAccessContext())
    ) {
      closeConfirmation();
      return;
    }

    try {
      await deletePage(pageId, workspaceId, jwt ?? "");
      redirectIfAffectedPageChanged();
    } catch (err) {
      console.error("[PageOptionsMenu] Failed to delete page", err);
    } finally {
      closeConfirmation();
    }
  };

  return (
    <>
      {isMenuOpen &&
        portalTarget &&
        createPortal(
          <div
            ref={menuRef}
            data-testid="page-options-menu"
            className={`${MENU_PANEL_CLASS} absolute w-[200px]`}
            style={{
              top: menuPosition?.top ?? 0,
              left: menuPosition?.left ?? 0,
              visibility: menuPosition ? "visible" : "hidden",
            }}
          >
            <button
              type="button"
              className={MENU_ROW_CLASS}
              onClick={handleDuplicateClick}
            >
              <Copy size={14} className="shrink-0" />
              <span>Duplicate</span>
            </button>

            <button
              type="button"
              className={MENU_ROW_CLASS}
              onClick={handleMoveClick}
            >
              <ArrowRight size={14} className="shrink-0" />
              <span>Move to</span>
            </button>

            <button
              type="button"
              data-testid="page-options-export"
              className={MENU_ROW_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                setOpen("export");
              }}
            >
              <FileDown size={14} className="shrink-0" />
              <span>Export</span>
            </button>

            <button
              type="button"
              className={MENU_ROW_CLASS}
              onClick={handleConvertClick}
            >
              {isFolder ? (
                <FileText size={14} className="shrink-0" />
              ) : (
                <Folder size={14} className="shrink-0" />
              )}
              <span>{isFolder ? "Convert to page" : "Convert to folder"}</span>
            </button>

            <button
              type="button"
              className={MENU_ROW_CLASS}
              onClick={handleConvertWikiClick}
            >
              {isWiki ? (
                <FileText size={14} className="shrink-0" />
              ) : (
                <BookOpen size={14} className="shrink-0" />
              )}
              <span>{isWiki ? "Convert to page" : "Convert to wiki"}</span>
            </button>

            <button
              type="button"
              className={MENU_ROW_CLASS}
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveClick(e);
              }}
            >
              <Archive size={14} className="shrink-0" />
              <span>Archive</span>
            </button>

            <button
              type="button"
              className={MENU_ROW_CLASS}
              data-tone="danger"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(e);
              }}
            >
              <Trash2 size={14} className="shrink-0" />
              <span>Delete</span>
            </button>

            {/* Debug tools: layout/edit diagnostics. Toggles keep the menu open
                so several can be flipped in one visit; state persists. */}
            <div className="my-1 border-t border-[var(--osio-border-default)]" />
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">
              <Bug size={11} className="shrink-0" />
              Tools
            </div>
            {PAGE_DEBUG_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                data-testid={`debug-tool-${tool.id}`}
                className={MENU_ROW_CLASS}
                title={tool.hint}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDebugTool(tool.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                {debugToolsEnabled[tool.id] && (
                  <Check size={14} className="shrink-0 text-[var(--osio-accent)]" />
                )}
              </button>
            ))}
          </div>,
          portalTarget,
        )}

      {open === "export" && workspaceId ? (
        <React.Suspense fallback={null}>
          <ExportDialog
            open
            pageId={pageId}
            workspaceId={workspaceId}
            onClose={() => setOpen(null)}
          />
        </React.Suspense>
      ) : null}

      {confirmationMode &&
        portalTarget &&
        createPortal(
          <ConfirmDeleteModal
            variant={confirmationMode}
            pageTitle={pageTitle}
            subPageCount={subPageCount}
            title={
              confirmationMode === "delete" ? "¿Delete permanently?" : undefined
            }
            description={
              confirmationMode === "delete"
                ? "This action can't be undone. All information in this page will be lost."
                : undefined
            }
            confirmLabel={confirmationMode === "delete" ? "Delete" : "Archive"}
            onConfirm={
              confirmationMode === "delete"
                ? handleConfirmDelete
                : handleConfirmArchive
            }
            onCancel={closeConfirmation}
          />,
          portalTarget,
        )}

      {open === "move" &&
        portalTarget &&
        createPortal(
          <MovePageModal
            sourcePageId={pageId}
            onClose={() => setOpen(null)}
          />,
          portalTarget,
        )}
    </>
  );
};
