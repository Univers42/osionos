/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dirActions.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Directory-only actions (scope:"dir"): New file, New folder, Open containing
// folder, Find in folder, + STUBS (Open in images preview / Folder history).
// Reuses usePageStore.addPage and the top-bar palette — no new persistence.

import { FilePlus, FolderPlus, FolderOpen, FolderSearch, Image, History } from "lucide-react";
import { usePalette } from "@/widgets/top-bar/model/usePalette";
import type { MenuActionCtx, PageMenuAction } from "../types";

/** Sidebar listens for this to expand ancestors + scroll a page into view. */
export const REVEAL_PAGE_EVENT = "osionos:reveal-page";

/** All descendant page ids under `rootId` (depth-first over the workspace set). */
function descendantIds(ctx: MenuActionCtx): string[] {
  const pages = ctx.workspacePages();
  const childrenOf = new Map<string, string[]>();
  for (const page of pages) {
    const parent = page.parentPageId ?? "";
    (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(page._id);
  }
  const out: string[] = [];
  const stack = [...(childrenOf.get(ctx.page._id) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** Create a child page (or folder) under this dir and open it when it's a file. */
async function createChild(ctx: MenuActionCtx, asFolder: boolean): Promise<void> {
  const title = asFolder ? "New folder" : "Untitled";
  const child = await ctx.store
    .getState()
    .addPage(ctx.workspaceId, title, ctx.jwt, ctx.page._id, asFolder ? { surface: "folder" } : undefined);
  if (!child) {
    ctx.toast({ kind: "error", title: asFolder ? "Couldn't create folder" : "Couldn't create file" });
    return;
  }
  if (!asFolder) {
    ctx.store.getState().openPage({ id: child._id, workspaceId: ctx.workspaceId, kind: "page", title: child.title });
  }
}

export const DIR_ACTIONS: PageMenuAction[] = [
  {
    id: "new-file",
    label: "New file",
    icon: FilePlus,
    scope: "dir",
    section: "create",
    run: (ctx) => createChild(ctx, false),
  },
  {
    id: "new-folder",
    label: "New folder",
    icon: FolderPlus,
    scope: "dir",
    section: "create",
    run: (ctx) => createChild(ctx, true),
  },
  {
    id: "open-containing-folder",
    label: "Open containing folder",
    icon: FolderOpen,
    scope: "dir",
    section: "reveal",
    run: (ctx) => {
      const parentId = ctx.page.parentPageId;
      if (!parentId) {
        ctx.toast({ kind: "info", title: "Already at the workspace root" });
        return;
      }
      // Sidebar rows listen for this and expand ancestors + scroll into view.
      globalThis.dispatchEvent?.(new CustomEvent(REVEAL_PAGE_EVENT, { detail: { pageId: parentId } }));
    },
  },
  {
    id: "find-in-folder",
    label: "Find in folder",
    icon: FolderSearch,
    scope: "dir",
    section: "reveal",
    run: (ctx) => {
      const ids = descendantIds(ctx);
      if (ids.length === 0) {
        ctx.toast({ kind: "info", title: "This folder is empty" });
        return;
      }
      // Open the palette pre-scoped to this folder's name (instant page search).
      usePalette.getState().openSearch();
      usePalette.getState().setQuery(ctx.page.title || "");
    },
  },
  {
    id: "images-preview",
    label: "Open in images preview",
    icon: Image,
    scope: "dir",
    section: "stubs",
    run: (ctx) => {
      ctx.toast({ kind: "info", title: "Not available yet" });
    },
  },
  {
    id: "folder-history",
    label: "Folder history",
    icon: History,
    scope: "dir",
    section: "stubs",
    run: (ctx) => {
      ctx.toast({ kind: "info", title: "Not available yet" });
    },
  },
];
