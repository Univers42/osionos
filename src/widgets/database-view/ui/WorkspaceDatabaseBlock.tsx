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
import { ObjectDatabase, type ObjectDatabaseProps } from "@notion-db/object-database";

import { usePageStore } from "@/store/usePageStore";
import { OsionosPage } from "@/pages/notion-page/ui/NotionPage";
import { getWorkspaceDatabaseAdapter } from "../model/workspaceDatabaseState";
import {
  WS_FILES_DB_ID,
  WS_FILES_GALLERY_VIEW,
  WS_FOLDERS_TABLE_VIEW,
} from "../model/workspaceDatabaseConstants";

interface WorkspaceDatabaseBlockProps {
  databaseId: string;
  initialViewId?: string;
  mode?: "inline" | "full";
}

/** A record peek that opens the EXISTING osionos page (records are real pages). */
const WorkspaceRecordPeek: React.FC<{ pageId: string; onClose: () => void }> = ({ pageId, onClose }) => {
  const osionosPage = usePageStore((state) => state.pageById(pageId));
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[var(--osio-z-modal)] flex justify-end bg-[var(--osio-overlay)]">
      <button
        type="button"
        aria-label="Close record"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside className="relative z-[var(--osio-z-modal)] h-full w-full max-w-5xl overflow-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-2xl">
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

/** Renders a workspace database (Folders / Files) backed by the live page store. */
export const WorkspaceDatabaseBlock: React.FC<WorkspaceDatabaseBlockProps> = ({
  databaseId,
  initialViewId,
  mode = "inline",
}) => {
  const adapter = React.useMemo(() => getWorkspaceDatabaseAdapter(), []);
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
        className={mode === "full" ? "h-full" : undefined}
        chrome="single-view"
      />
    </div>
  );
};
