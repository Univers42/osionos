/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerContext.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext, useContext, type ComponentType } from "react";

import type { DirState, ExplorerRow, ExplorerRowKind } from "../model/explorerRows";

/** What the tree needs from where it runs. The app passes its stores; a page the node serves has
 *  none (editor on disk, F2), and the defaults draw a plain file tree. */
export type ExplorerHost = {
  useIsActive(pageId: string): boolean;
  beginDrag(pageId: string): void;
  endDrag(): void;
  PageGlyph?: ComponentType<{ pageId: string }>;
};

const useNeverActive = (): boolean => false;
const noDrag = (): void => undefined;
export const PLAIN_EXPLORER_HOST: ExplorerHost = { useIsActive: useNeverActive, beginDrag: noDrag, endDrag: noDrag };

/** The words that differ between a cloud workspace and a folder on a computer. */
export type ExplorerCopy = {
  toolbar: string;
  loading: string;
  errorTitle: string;
  emptyTitle: string;
  deleteQuestion(name: string): string;
  deleteAction: string;
};

export const WORKSPACE_EXPLORER_COPY: ExplorerCopy = {
  toolbar: "Files",
  loading: "Loading workspace files…",
  errorTitle: "Could not read the workspace folder",
  emptyTitle: "This workspace folder is empty",
  deleteQuestion: (name) => `Move “${name}” to the trash? A folder goes with everything inside. Restore it from Archived files.`,
  deleteAction: "Move to trash",
};

export type ExplorerPending =
  | { type: "create"; parent: string; kind: "file" | "dir" }
  | { type: "rename"; rel: string }
  | { type: "delete"; rel: string };

/** Interaction state shared by the recursive rows, so props do not fan out
 *  through every level of the tree. */
export type ExplorerContextValue = {
  dirs: Readonly<Record<string, DirState>>;
  expanded: ReadonlySet<string>;
  /** The one row with tabIndex 0 (roving tabindex). */
  tabbableRel: string;
  /** Resolves a row's (rel, kind) to its page ID, if any. Undefined when the
   *  explorer is used without a workspace (sandbox) or for non-page rows. */
  pageIdOf: ((rel: string, kind: ExplorerRowKind) => string | undefined) | undefined;
  pending: ExplorerPending | null;
  focusRow(rel: string): void;
  activate(rel: string, row: ExplorerRow): void;
  submitCreate(name: string): void;
  submitRename(rel: string, name: string): void;
  cancelEdit(): void;
  moveTo(fromRel: string, targetDir: string): void;
  retry(dir: string): void;
  /** Opens the page actions menu for the given row. The host widget wires the
   *  actual PageContextMenu; the explorer only reports the request. */
  openMenu(rel: string, row: ExplorerRow, at: { x: number; y: number }): void;
  host: ExplorerHost;
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);
export const ExplorerProvider = ExplorerContext.Provider;

export function useExplorer(): ExplorerContextValue {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error("useExplorer must be used inside <WorkspaceExplorer>");
  return value;
}
