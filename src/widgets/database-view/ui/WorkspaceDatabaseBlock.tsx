/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceDatabaseBlock.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import ReactDOM from "react-dom";
import {
  ObjectDatabase,
  type ObjectDatabaseProps,
  type ObjectDatabaseTemplatesController,
} from "@notion-db/object-database";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { OsionosPage } from "@/pages/notion-page/ui/NotionPage";
import { getWorkspaceDatabaseAdapter } from "../model/workspaceDatabaseState";
import {
  WS_FILES_DB_ID,
  WS_FILES_GALLERY_VIEW,
  WS_FOLDERS_TABLE_VIEW,
} from "../model/workspaceDatabaseConstants";
// Side effect: registers the data-source catalog (Source picker) — lazyViews
// imports this file directly, bypassing the barrel's registration.
import "../model/dataSourceProvider";

interface WorkspaceDatabaseBlockProps {
  databaseId: string;
  initialViewId?: string;
  mode?: "inline" | "full";
  /** "full" shows the notion-database-sys chrome (view switcher); default single view. */
  chrome?: "full" | "single-view";
}

/** A record peek that opens the EXISTING osionos page (records are real pages).
 *  Exported so the Home live carousels (Recents/Templates) reuse the same
 *  "card → open the real page" seam through DatabaseBlock. */
export const WorkspaceRecordPeek: React.FC<{ pageId: string; onClose: () => void }> = ({ pageId, onClose }) => {
  const osionosPage = usePageStore((state) => state.pageById(pageId));
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[var(--osio-z-modal)] flex justify-end bg-[var(--osio-overlay)]">
      <button
        type="button"
        aria-label="Close record"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside className="relative z-[var(--osio-z-modal)] h-full w-full max-w-5xl overflow-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-modal)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-6 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">
            Workspace record · osionos page
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {osionosPage ? <OsionosPage pageId={pageId} /> : (
          <div className="mx-auto max-w-3xl px-10 py-10 text-sm text-[var(--osio-fg-muted)]">Page unavailable</div>
        )}
      </aside>
    </div>,
    document.body,
  );
};

/** Build the templates controller over the live page store (templates are real osionos_pages). */
function useWorkspaceTemplatesController(): ObjectDatabaseTemplatesController | undefined {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const wsPages = usePageStore((s) => (workspaceId ? s.pages[workspaceId] ?? [] : []));
  const list = React.useMemo(
    () =>
      wsPages
        .filter((p) => p.isTemplate && !p.archivedAt)
        .map((p) => ({ id: p._id, title: p.title, icon: p.icon, isDefault: p.isDefaultTemplate ?? false })),
    [wsPages],
  );
  return React.useMemo<ObjectDatabaseTemplatesController | undefined>(() => {
    if (!workspaceId) return undefined;
    const store = () => usePageStore.getState();
    const jwt = () => useUserStore.getState().activePageJwt() ?? "";
    return {
      list,
      onCreateFrom: (id) => void store().createPageFromTemplate(id, workspaceId, jwt()),
      onOpen: (id) => {
        const page = store().pageById(id);
        store().openPage({ id, workspaceId, kind: "page", title: page?.title, icon: page?.icon });
      },
      onNew: () => void store().addTemplate(workspaceId, jwt()),
      onSetDefault: (id) => store().setDefaultTemplate(id, workspaceId),
      onDuplicate: (id) =>
        void store().duplicatePage(id, workspaceId).then((newId) => {
          if (newId) store().patchPage(newId, { isDefaultTemplate: false });
        }),
      onDelete: (id) => void store().archivePage(id, workspaceId, jwt()),
    };
  }, [list, workspaceId]);
}

/** Renders a workspace database (Folders / Files) backed by the live page store. */
export const WorkspaceDatabaseBlock: React.FC<WorkspaceDatabaseBlockProps> = ({
  databaseId,
  initialViewId,
  mode = "inline",
  chrome = "single-view",
}) => {
  const adapter = React.useMemo(() => getWorkspaceDatabaseAdapter(), []);
  const templates = useWorkspaceTemplatesController();
  const view = initialViewId
    ?? (databaseId === WS_FILES_DB_ID ? WS_FILES_GALLERY_VIEW : WS_FOLDERS_TABLE_VIEW);
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps["renderPage"]>>(
    (pageId, _state, onClose) => <WorkspaceRecordPeek pageId={pageId} onClose={onClose} />,
    [],
  );
  return (
    <div
      className={[
        "osionos-database-block w-full min-w-0 overflow-auto",
        mode === "full" ? "osionos-database-block--full h-full" : "osionos-database-block--inline my-2",
      ].join(" ")}
      data-database-id={databaseId}
      data-database-view-id={initialViewId}
    >
      <ObjectDatabase
        adapter={adapter}
        databaseId={databaseId}
        initialView={view}
        mode={mode === "full" ? "page" : "inline"}
        renderPage={renderPage}
        templates={templates}
        className={mode === "full" ? "h-full" : undefined}
        chrome={chrome}
      />
    </div>
  );
};
