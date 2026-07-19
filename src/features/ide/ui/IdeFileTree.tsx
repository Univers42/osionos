/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeFileTree.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { usePageStore } from "@/store/usePageStore";
import { buildIdeFileTree, type IdeTreeNode } from "../model/ideFileTree";
import type { IdeCreateRequest, IdeFileOps } from "../model/useIdeFileOps";
import { IdeTreeContext, type IdeTreeContextValue } from "./ideTreeContext";
import { IdeTreeRow } from "./IdeTreeRow";
import { IdeInlineInput } from "./IdeInlineInput";

const EMPTY: never[] = [];
const DRAG_MIME = "application/x-osio-ide-page";

interface Props {
  ops: IdeFileOps;
  create: IdeCreateRequest | null;
  renamingId: string | null;
  onStartCreate: (parentId: string | null, kind: "code" | "folder") => void;
  onSubmitCreate: (name: string) => void;
  onCancelCreate: () => void;
  onStartRename: (id: string) => void;
  onSubmitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
}

/** The file explorer tree over the workspace's folder + code pages. Provides the
 *  tree context (ops + interaction state) that recursive rows consume; a bare
 *  drop zone below the roots moves a dragged entry to the workspace root. */
export const IdeFileTree: React.FC<Props> = (props) => {
  const { ops } = props;
  const pages = usePageStore((s) => s.pages[ops.workspaceId]) ?? EMPTY;
  const activeId = usePageStore((s) => s.activePage?.id ?? null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const tree = React.useMemo(() => buildIdeFileTree(pages), [pages]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openFile = React.useCallback(
    (node: IdeTreeNode) => {
      usePageStore.getState().openPage({ id: node.page._id, workspaceId: ops.workspaceId, kind: "page", title: node.page.title });
    },
    [ops.workspaceId],
  );

  // Creating inside a folder must reveal that folder so the inline input shows.
  React.useEffect(() => {
    const parentId = props.create?.parentId;
    if (parentId) setExpanded((prev) => (prev.has(parentId) ? prev : new Set(prev).add(parentId)));
  }, [props.create]);

  const ctx: IdeTreeContextValue = React.useMemo(
    () => ({
      ops,
      activeId,
      expanded,
      toggle,
      openFile,
      renamingId: props.renamingId,
      startRename: props.onStartRename,
      submitRename: props.onSubmitRename,
      cancelRename: props.onCancelRename,
      create: props.create,
      startCreate: props.onStartCreate,
      submitCreate: props.onSubmitCreate,
      cancelCreate: props.onCancelCreate,
    }),
    [ops, activeId, expanded, toggle, openFile, props],
  );

  return (
    <IdeTreeContext.Provider value={ctx}>
      <div
        role="tree"
        className="min-h-full py-1"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const dragged = event.dataTransfer.getData(DRAG_MIME);
          if (dragged) ops.move(dragged, null);
        }}
      >
        {props.create && props.create.parentId === null && (
          <IdeInlineInput
            depth={0}
            placeholder={props.create.kind === "folder" ? "folder name" : "file name"}
            onSubmit={props.onSubmitCreate}
            onCancel={props.onCancelCreate}
          />
        )}
        {tree.length === 0 && !props.create ? (
          <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
            No code files yet. Use New File above to start a project.
          </p>
        ) : (
          tree.map((node) => <IdeTreeRow key={node.page._id} node={node} depth={0} />)
        )}
      </div>
    </IdeTreeContext.Provider>
  );
};
