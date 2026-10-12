/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceExplorer.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { useExplorerController, type ExplorerControllerProps } from "./useExplorerController";
import { baseName } from "../model/workspacePath";
import { ExplorerProvider } from "./explorerContext";
import { ExplorerDeleteConfirm, ExplorerEmpty, ExplorerError, ExplorerLoading, ExplorerNotice } from "./ExplorerStates";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { EXPLORER_DRAG_MIME, ExplorerBranch } from "./WorkspaceExplorerRow";

export type WorkspaceExplorerProps = ExplorerControllerProps;

/** The one workspace tree: lazy, keyboard-navigable (WAI-ARIA tree), reads and
 *  writes only through `ops`. `onOpen` gets a path: the caller maps it to a page
 *  or editor. */
export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = (props) => {
  const { tree, actions, value, rootRef, onKeyDown, onRootDrop, cancelEdit, newIn } = useExplorerController(props);
  const root = tree.dirs[""];
  const { pending } = actions;
  const isEmpty = root?.status === "ready" && root.rows.length === 0 && pending?.type !== "create";
  const deleting = pending?.type === "delete" ? pending.rel : null;

  return (
    <ExplorerProvider value={value}>
      <div
        ref={rootRef}
        onKeyDown={onKeyDown}
        onDragOver={(event) => { if (event.dataTransfer.types.includes(EXPLORER_DRAG_MIME)) event.preventDefault(); }}
        onDrop={onRootDrop}
        className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)]"
      >
        <ExplorerToolbar onNewFile={newIn("file")} onNewFolder={newIn("dir")} onRefresh={() => void tree.refresh()} />
        {actions.notice && <ExplorerNotice message={actions.notice} onDismiss={actions.dismissNotice} />}
        {tree.watchNotice && <ExplorerNotice message={tree.watchNotice} />}
        <div className="min-h-0 flex-1 overflow-auto">
          {(!root || root.status === "loading") && <ExplorerLoading />}
          {root?.status === "error" && <ExplorerError message={root.message} onRetry={() => void tree.load("")} />}
          {isEmpty && <ExplorerEmpty onNewFile={newIn("file")} onNewFolder={newIn("dir")} />}
          {root?.status === "ready" && !isEmpty && <ExplorerBranch dir="" level={1} root />}
        </div>
        {deleting !== null && (
          <ExplorerDeleteConfirm name={baseName(deleting)} onCancel={cancelEdit} onConfirm={() => actions.confirmDelete(deleting)} />
        )}
      </div>
    </ExplorerProvider>
  );
};
