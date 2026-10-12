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

import { flattenVisible } from "../model/explorerRows";
import { useExplorerTree } from "../model/useExplorerTree";
import type { WorkspaceFileOps } from "../model/workspaceFileOps";
import { parentOf } from "../model/workspacePath";
import type { ExplorerContextValue } from "./explorerContext";
import { useExplorerActions } from "./useExplorerActions";
import { useExplorerFocus } from "./useExplorerFocus";
import { useExplorerKeyDown } from "./useExplorerKeyDown";
import { EXPLORER_DRAG_MIME } from "./WorkspaceExplorerRow";

export type ExplorerControllerProps = {
  ops: WorkspaceFileOps;
  onOpen: (relPath: string, kind: "page" | "code") => void;
  activeRel?: string;
};

/** Wires tree state, focus, mutations and keys into the context value the rows
 *  read plus the root-level handlers. No JSX: WorkspaceExplorer only lays out. */
export function useExplorerController({ ops, onOpen, activeRel }: ExplorerControllerProps) {
  const tree = useExplorerTree(ops);
  const visible = React.useMemo(() => flattenVisible(tree.dirs, tree.expanded), [tree.dirs, tree.expanded]);
  const { rootRef, tabbableRel, focusRow } = useExplorerFocus(visible);
  const actions = useExplorerActions({ ops, tree, onOpen });
  const { pending, setPending } = actions;

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

  const value: ExplorerContextValue = {
    dirs: tree.dirs, expanded: tree.expanded, tabbableRel, activeRel, pending,
    focusRow, activate, cancelEdit,
    submitCreate: actions.submitCreate,
    submitRename: actions.submitRename,
    moveTo: actions.moveTo,
    retry: (dir) => void tree.load(dir),
  };
  const onKeyDown = useExplorerKeyDown({
    visible, tabbableRel, expanded: tree.expanded, setOpen: tree.setOpen, focusRow, activate, setPending,
  });
  const onRootDrop = (event: React.DragEvent): void => {
    const from = event.dataTransfer.getData(EXPLORER_DRAG_MIME);
    if (!from) return;
    event.preventDefault();
    if (parentOf(from) !== "") actions.moveTo(from, "");
  };

  return { tree, actions, value, rootRef, onKeyDown, onRootDrop, cancelEdit, newIn };
}
