/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerController.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { flattenForRender, indexByRel } from "../model/explorerRows";
import { useExplorerTree } from "../model/useExplorerTree";
import type { WorkspaceFileOps } from "../model/workspaceFileOps";
import { parentOf } from "../model/workspacePath";
import type { ExplorerContextValue } from "./explorerContext";
import type { ExplorerRow, ExplorerRowKind } from "../model/explorerRows";
import { useExplorerActions } from "./useExplorerActions";
import { useExplorerFocus } from "./useExplorerFocus";
import { useExplorerKeyDown } from "./useExplorerKeyDown";
import { useExplorerVirtualizer } from "./useExplorerVirtualizer";
import { EXPLORER_DRAG_MIME } from "./WorkspaceExplorerRow";

/** Payload sent to the host widget when a row requests its page actions menu.
 *  The widget builds the PageContextMenu from this; the explorer stays generic. */
export type ExplorerMenuRequest = {
  /** Relative path of the row within the workspace tree. */
  rel: string;
  /** Row kind: "dir" | "page" | "code". */
  kind: ExplorerRowKind;
  /** Page ID if this row maps to a page entry (via pageIdOf); undefined otherwise. */
  pageId: string | undefined;
  /** Screen coordinates where the menu should anchor. */
  x: number;
  y: number;
  /** Starts the explorer's inline rename flow for this row. */
  rename(): void;
  /** Starts the explorer's delete confirm flow for this row. */
  remove(): void;
  /** Restores keyboard focus to the row after the menu closes. */
  restoreFocus(): void;
};

export type ExplorerControllerProps = {
  ops: WorkspaceFileOps;
  onOpen: (relPath: string, kind: "page" | "code") => void;
  pageIdOf?: (rel: string, kind: "dir" | "page" | "code") => string | undefined;
  onImportFolder?: () => void;
  onExportZip?: () => void;
  /** Optional callback fired when a row requests its context menu. When absent,
   *  openMenu in the context value is a no-op. */
  onRowMenu?: (request: ExplorerMenuRequest) => void;
};

/** Wires tree state, focus, mutations and keys into the context value the rows
 *  read plus the root-level handlers. No JSX: WorkspaceExplorer only lays out. */
export function useExplorerController({ ops, onOpen, pageIdOf, onRowMenu }: ExplorerControllerProps) {
  const tree = useExplorerTree(ops);
  const actions = useExplorerActions({ ops, tree, onOpen });
  const { pending, setPending } = actions;
  const creating = pending?.type === "create" ? pending : null;
  const rows = React.useMemo(() => flattenForRender(tree.dirs, tree.expanded, creating), [tree.dirs, tree.expanded, creating]);
  const visible = React.useMemo(() => rows.flatMap((row) => (row.type === "item" ? [row.item] : [])), [rows]);
  const rowIndex = React.useMemo(() => indexByRel(rows), [rows]);
  const { rootRef, tabbableRel, focusRow } = useExplorerFocus(rowIndex, visible[0]?.rel ?? "");
  const { scrollRef, virtualizer } = useExplorerVirtualizer(rows, rowIndex.get(tabbableRel) ?? -1);

  const activate: ExplorerContextValue["activate"] = (rel, row) => {
    focusRow(rel);
    if (row.kind === "dir") tree.setOpen(rel, !tree.expanded.has(rel));
    else onOpen(rel, row.kind);
  };
  const cancelEdit = (): void => { setPending(null); focusRow(tabbableRel); };
  const newIn = (kind: "file" | "dir") => (): void => {
    const current = visible.find((item) => item.rel === tabbableRel);
    actions.startCreate(current ? (current.row.kind === "dir" ? current.rel : current.parentRel) : "", kind);
  };

  // A closed menu returns keyboard focus to its row unless the chosen action
  // started an inline flow (rename/delete) that owns focus until its own
  // cancel/submit. Those actions bump the token so the armed restore is dropped;
  // otherwise focusRow would blur the just-mounted input and commit the edit.
  const restoreToken = React.useRef(0);
  // useExplorerFocus focuses from an effect that only runs on a commit, and
  // re-focusing the row that is already tabbableRel changes no state: bump a
  // tick so that commit happens and the pending focus is applied.
  const [, bumpRestore] = React.useState(0);

  const openMenu = (rel: string, row: ExplorerRow, at: { x: number; y: number }): void => {
    if (!onRowMenu) return;
    onRowMenu({
      rel,
      kind: row.kind,
      pageId: pageIdOf?.(rel, row.kind),
      x: at.x,
      y: at.y,
      rename: () => { restoreToken.current++; setPending({ type: "rename", rel }); },
      remove: () => { restoreToken.current++; setPending({ type: "delete", rel }); },
      restoreFocus: () => {
        const token = ++restoreToken.current;
        // Deferred one microtask: PageContextMenu runs onClose before action.run,
        // so a rename/remove fired right after can still cancel this restore.
        queueMicrotask(() => {
          if (restoreToken.current !== token) return;
          focusRow(rel);
          bumpRestore((tick) => tick + 1);
        });
      },
    });
  };

  const value: ExplorerContextValue = {
    dirs: tree.dirs,
    expanded: tree.expanded,
    tabbableRel,
    pageIdOf,
    pending,
    focusRow,
    activate,
    cancelEdit,
    submitCreate: actions.submitCreate,
    submitRename: actions.submitRename,
    moveTo: actions.moveTo,
    retry: (dir) => void tree.load(dir),
    openMenu,
  };
  const onKeyDown = useExplorerKeyDown({
    visible,
    tabbableRel,
    expanded: tree.expanded,
    setOpen: tree.setOpen,
    focusRow,
    activate,
    setPending,
    rootRef,
    openMenu,
  });
  const onRootDrop = (event: React.DragEvent): void => {
    const from = event.dataTransfer.getData(EXPLORER_DRAG_MIME);
    if (!from) return;
    event.preventDefault();
    if (parentOf(from) !== "") actions.moveTo(from, "");
  };

  return { tree, actions, value, rootRef, onKeyDown, onRootDrop, cancelEdit, newIn, rows, scrollRef, virtualizer };
}
