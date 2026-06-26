/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sharedActions.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared actions (scope:"both" — file + dir): Cut, Copy, Paste, Copy path,
// Copy relative path, Rename, Delete. Reuses the clipboard store, the page
// store's movePage/duplicatePage, ctx.onRename / ctx.onDelete and the clipboard.

import {
  Scissors,
  Copy,
  ClipboardPaste,
  Link2,
  CornerDownRight,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PageEntry } from "@/entities/page";
import type { MenuActionCtx, PageMenuAction } from "../types";

/** Walk parentPageId from `page` up to the workspace root. Returns root→page. */
function ancestorChain(page: PageEntry, all: PageEntry[]): PageEntry[] {
  const byId = new Map(all.map((p) => [p._id, p]));
  const chain: PageEntry[] = [];
  const seen = new Set<string>();
  let cur: PageEntry | undefined = page;
  while (cur && !seen.has(cur._id)) {
    seen.add(cur._id);
    chain.unshift(cur);
    cur = cur.parentPageId ? byId.get(cur.parentPageId) : undefined;
  }
  return chain;
}

const titleOf = (p: PageEntry) => p.title || "Untitled";

/** "Workspace / Parent / Page" — breadcrumb from the workspace root. */
function fullPath(ctx: MenuActionCtx): string {
  const chain = ancestorChain(ctx.page, ctx.workspacePages());
  return ["Workspace", ...chain.map(titleOf)].join(" / ");
}

/** "/Parent/Page" — POSIX-style path relative to the workspace root. */
function relativePath(ctx: MenuActionCtx): string {
  const chain = ancestorChain(ctx.page, ctx.workspacePages());
  return "/" + chain.map(titleOf).join("/");
}

async function writeClipboard(text: string, ctx: MenuActionCtx, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast({ kind: "success", title: `${label} copied` });
  } catch {
    ctx.toast({ kind: "error", title: "Clipboard unavailable" });
  }
}

export const SHARED_ACTIONS: PageMenuAction[] = [
  {
    id: "cut",
    label: "Cut",
    icon: Scissors,
    scope: "both",
    section: "clipboard",
    run: (ctx) => {
      ctx.clipboard.getState().set(ctx.page._id, "cut");
      ctx.toast({ kind: "info", title: `Cut "${titleOf(ctx.page)}"` });
    },
  },
  {
    id: "copy",
    label: "Copy",
    icon: Copy,
    scope: "both",
    section: "clipboard",
    run: (ctx) => {
      ctx.clipboard.getState().set(ctx.page._id, "copy");
      ctx.toast({ kind: "info", title: `Copied "${titleOf(ctx.page)}"` });
    },
  },
  {
    id: "paste",
    label: "Paste",
    icon: ClipboardPaste,
    scope: "both",
    section: "clipboard",
    // Paste only lands inside a folder, and only with something on the clipboard.
    enabled: (ctx) => ctx.isFolder && !!ctx.clipboard.getState().pageId,
    run: async (ctx) => {
      const clip = ctx.clipboard.getState();
      const sourceId = clip.pageId;
      if (!sourceId) return;
      // Guard: never paste a node into itself.
      if (sourceId === ctx.page._id) {
        ctx.toast({ kind: "warning", title: "Can't paste a folder into itself" });
        return;
      }
      const store = ctx.store.getState();
      if (clip.mode === "cut") {
        store.movePage(sourceId, ctx.page._id, ctx.workspaceId);
        clip.clear();
        ctx.toast({ kind: "success", title: `Moved into "${titleOf(ctx.page)}"` });
        return;
      }
      // copy → clone (as a sibling), then reparent the clone into the folder.
      const newId = await store.duplicatePage(sourceId, ctx.workspaceId);
      if (!newId) {
        ctx.toast({ kind: "error", title: "Paste failed" });
        return;
      }
      store.movePage(newId, ctx.page._id, ctx.workspaceId);
      ctx.toast({ kind: "success", title: `Pasted into "${titleOf(ctx.page)}"` });
    },
  },
  {
    id: "copy-path",
    label: "Copy path",
    icon: Link2,
    scope: "both",
    section: "path",
    run: (ctx) => writeClipboard(fullPath(ctx), ctx, "Path"),
  },
  {
    id: "copy-relative-path",
    label: "Copy relative path",
    icon: CornerDownRight,
    scope: "both",
    section: "path",
    run: (ctx) => writeClipboard(relativePath(ctx), ctx, "Relative path"),
  },
  {
    id: "rename",
    label: "Rename",
    icon: Pencil,
    scope: "both",
    section: "edit",
    run: (ctx) => ctx.onRename(),
  },
  {
    id: "delete",
    label: "Delete",
    icon: Trash2,
    scope: "both",
    section: "edit",
    run: (ctx) => ctx.onDelete(),
  },
];
