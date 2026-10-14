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

import { createContext, useContext } from "react";

import type { DirState, ExplorerRow, ExplorerRowKind } from "../model/explorerRows";

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
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);
export const ExplorerProvider = ExplorerContext.Provider;

export function useExplorer(): ExplorerContextValue {
  const value = useContext(ExplorerContext);
  if (!value) throw new Error("useExplorer must be used inside <WorkspaceExplorer>");
  return value;
}
