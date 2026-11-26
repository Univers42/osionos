/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editorActions.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { findBlockLocation, moveBlockInTree } from "@/features/block-editor/model/blockContextMenu.helpers";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { pageHandleFor, type EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import type { MenuAction } from "../menuTypes";
import { activeTab } from "./menuActions";

type RowSpec = Pick<MenuAction, "id" | "label" | "accelerator" | "separatorAfter">;
type BlockOperation = (handle: EditorHandle, ids: readonly string[]) => void;

interface EditorTarget {
  handle: EditorHandle;
  ids: readonly string[];
}

/**
 * The page editor of the ACTIVE tab, or null when that tab holds none. Resolved
 * through pageHandleFor, never useEditorCommandBus.active: `active` is cleared
 * only on unmount, so it can name an editor in a tab that is not showing.
 */
export function activeEditor(): EditorHandle | null {
  const tab = activeTab();
  return tab ? pageHandleFor(tab.pageId) : null;
}

/** The active editor and its selected block ids; null without an editor, or without a selection when `needsSelection`. */
function editorTarget(needsSelection: boolean): EditorTarget | null {
  const handle = activeEditor();
  if (!handle) return null;
  const ids = useBlockSelection.getState().selectedIdsFor(handle.sourceKey);
  return needsSelection && ids.length === 0 ? null : { handle, ids };
}

/**
 * A row that operates on the active page editor. Disabled, and a no-op when
 * run, while there is no editor (or no selected block when `needsSelection`).
 */
export function blockAction(row: RowSpec, needsSelection: boolean, operate: BlockOperation): MenuAction {
  return {
    ...row,
    disabled: () => editorTarget(needsSelection) === null,
    run: () => {
      const target = editorTarget(needsSelection);
      if (target) operate(target.handle, target.ids);
    },
  };
}

/**
 * Undo or Redo: the editor's structural history while it has one, otherwise the
 * browser's native text history. Never disabled for an empty structural
 * history, since typing is undone natively (useBlockHistory). The native step
 * needs the editable focused when the row runs, so the row asks the dropdown
 * for that focus first (`refocusEditor`).
 */
export function historyAction(row: RowSpec, kind: "undo" | "redo"): MenuAction {
  const structural = (handle: EditorHandle): boolean => (kind === "undo" ? handle.canUndo() : handle.canRedo());
  const action = blockAction(row, false, (handle) => {
    if (!structural(handle)) document.execCommand(kind);
    else if (kind === "undo") handle.undo();
    else handle.redo();
  });
  return { ...action, refocusEditor: true };
}

/** Tell the user the browser refused the clipboard read, and where Paste still works. */
function pasteRefused(): void {
  useToastStore.getState().push({ kind: "info", title: "Paste isn't available here — use Ctrl+V" });
}

/** Wrap an async paste so a failure becomes a toast, never an unhandled rejection. */
export function pasteWith(paste: (handle: EditorHandle, ids: readonly string[]) => Promise<void>): BlockOperation {
  return (handle, ids) => {
    void paste(handle, ids).catch(pasteRefused);
  };
}

/** True when the single selected block has a neighbour to swap with in `direction`. */
function canMove(target: EditorTarget, direction: "up" | "down"): boolean {
  if (target.ids.length !== 1) return false;
  const location = findBlockLocation(target.handle.getContent(), target.ids[0]);
  if (!location) return false;
  return direction === "up" ? location.index > 0 : location.index < location.siblings.length - 1;
}

/** Move the one selected block past its neighbour; disabled at either end or when not exactly one block is selected. */
export function moveAction(row: RowSpec, direction: "up" | "down"): MenuAction {
  const movable = (): EditorTarget | null => {
    const target = editorTarget(true);
    return target && canMove(target, direction) ? target : null;
  };
  return {
    ...row,
    disabled: () => movable() === null,
    run: () => {
      const target = movable();
      if (target) target.handle.updateContent(moveBlockInTree(target.handle.getContent(), target.ids[0], direction).blocks);
    },
  };
}
