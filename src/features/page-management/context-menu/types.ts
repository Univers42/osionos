/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ComponentType } from "react";
import type { PageEntry } from "@/entities/page";
import type { usePageStore } from "@/store/usePageStore";
import type { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { useToastStore } from "@/shared/ui/primitives";
import type { usePageContextClipboard } from "./clipboardStore";

/** Stable identifier for each context-menu action (one per registry entry). */
export type MenuActionId =
  // shared (file + dir)
  | "cut"
  | "copy"
  | "paste"
  | "copy-path"
  | "copy-relative-path"
  | "rename"
  | "delete"
  // file only
  | "open-with"
  | "open"
  | "open-raw"
  | "open-graph"
  | "open-to-side"
  | "share"
  | "copy-remote-url"
  | "export-diagram"
  | "select-for-compare"
  | "open-changes"
  | "file-history"
  // dir only
  | "new-file"
  | "new-folder"
  | "open-containing-folder"
  | "find-in-folder"
  | "images-preview"
  | "folder-history";

/** A handle to the page store (the hook itself; call `.getState()` for actions). */
export type PageStoreHandle = typeof usePageStore;
/** A handle to the workspace-layout store (call `.getState()` for split/openTab). */
export type WorkspaceLayoutHandle = typeof useWorkspaceLayout;
/** A handle to the cut/copy clipboard store. */
export type ClipboardHandle = typeof usePageContextClipboard;
/** Toast push fn (best-effort / stub feedback + "Copied" confirmations). */
export type ToastFn = ReturnType<typeof useToastStore.getState>["push"];

/**
 * Everything an action's `run(ctx)` needs. Built once by PageTreeItem when the
 * context menu opens and passed unchanged to every action and submenu.
 */
export interface MenuActionCtx {
  /** The page this menu was opened on. */
  page: PageEntry;
  /** Convenience: `page.surface === "folder"`. Dir-only vs file-only branching. */
  isFolder: boolean;
  /** Owning workspace id (same as `page.workspaceId`, hoisted for convenience). */
  workspaceId: string;
  /** App-session JWT for store actions that persist (addPage/archivePage/…). */
  jwt: string;

  /** Page-store hook handle — use `store.getState()` for openPage/addPage/… */
  store: PageStoreHandle;
  /** Workspace-layout store getState — for splitWith/splitActivePane/openTab. */
  layout: WorkspaceLayoutHandle;
  /** Cut/copy clipboard store handle — `clipboard.getState()` for set/clear. */
  clipboard: ClipboardHandle;

  /** Push a toast (info/success/warning/error). */
  toast: ToastFn;

  /** Trigger PageTreeItem's inline rename (setRenaming(true)). */
  onRename: () => void;
  /** Trigger PageTreeItem's archive+confirm flow (requestDelete()). */
  onDelete: () => void;

  /** All pages in this workspace (for path breadcrumbs + diagram generation). */
  workspacePages: () => PageEntry[];
}

/** A single context-menu entry (leaf action or a submenu parent). */
export interface PageMenuAction {
  id: MenuActionId;
  label: string;
  /** Optional lucide icon component (size passed by the renderer). */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Which target this action applies to. `both` = file and folder. */
  scope: "file" | "dir" | "both";
  /** Group key — actions sharing a section render together (divider between). */
  section?: string;
  /** When false, the item renders disabled. Defaults to enabled. */
  enabled?: (ctx: MenuActionCtx) => boolean;
  /** Perform the action. Stubs may just push a toast. */
  run: (ctx: MenuActionCtx) => void | Promise<void>;
  /** Nested actions (e.g. "Open with" → Open / Open as raw / Open in graph). */
  submenu?: PageMenuAction[];
}
