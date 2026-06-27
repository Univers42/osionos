/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fileActions.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File-only actions (scope:"file"). Each run() is real behaviour or a clearly
// worded toast stub. Reuses store.openPage, useWorkspaceLayout.splitWith +
// pageEntryToTab, pageConfigStore (raw mode), useHomeVariantStore (graph) and
// the global useShareTarget seam — no logic reimplemented here.

import {
  AppWindow, FileText, GitBranch, GitCompareArrows, History,
  PanelRightOpen, Share2, Code, Network, ExternalLink, Link2,
} from "lucide-react";
import { useUserStore } from "@/features/auth";
import { usePageConfigStore } from "@/shared/config/pageConfigStore";
import { useHomeVariantStore } from "@/widgets/home-variants/model/homeVariantStore";
import { useShareTarget } from "@/features/share/useShareTarget";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import type { ActivePageKind, PageEntry } from "@/entities/page";
import type { MenuActionCtx, PageMenuAction } from "../types";

function activeKindOf(page: PageEntry): ActivePageKind {
  return page.databaseId ? "database" : "page";
}

/** Open the page in the active pane (legacy openPage handoff → layout mirror). */
function openPage(ctx: MenuActionCtx): void {
  const { page } = ctx;
  ctx.store.getState().openPage({
    id: page._id,
    workspaceId: ctx.workspaceId,
    kind: activeKindOf(page),
    title: page.title,
    icon: page.icon,
  });
}

/** Build a Mermaid `graph TD` of the page subtree rooted at this page. */
function buildSubtreeDiagram(root: PageEntry, all: PageEntry[]): string {
  const childrenOf = (id: string) => all.filter((p) => p.parentPageId === id);
  const nodeId = (id: string) => `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const label = (p: PageEntry) => (p.title || "Untitled").replace(/"/g, "'");
  const lines: string[] = ["graph TD"];
  const walk = (parent: PageEntry) => {
    for (const child of childrenOf(parent._id)) {
      lines.push(`  ${nodeId(parent._id)}["${label(parent)}"] --> ${nodeId(child._id)}["${label(child)}"]`);
      walk(child);
    }
  };
  if (childrenOf(root._id).length === 0) lines.push(`  ${nodeId(root._id)}["${label(root)}"]`);
  walk(root);
  return ["```mermaid", ...lines, "```", ""].join("\n");
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function pageDeepLink(pageId: string): string {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("page", pageId);
  return url.toString();
}

const OPEN_WITH: PageMenuAction[] = [
  {
    id: "open", label: "Open", icon: FileText, scope: "file",
    run: (ctx) => openPage(ctx),
  },
  {
    id: "open-raw", label: "Open as raw markdown", icon: Code, scope: "file",
    run: (ctx) => {
      openPage(ctx);
      const userId = useUserStore.getState().activeUserId || "anonymous";
      void usePageConfigStore.getState().updateConfig(userId, ctx.page._id, { rawMode: true });
    },
  },
  {
    id: "open-graph", label: "Open in graph", icon: Network, scope: "file",
    run: (ctx) => {
      useHomeVariantStore.getState().setVariant("graph");
      ctx.layout.getState().openTab({
        tabId: `tab-home-${Date.now()}`,
        pageId: "__home__", workspaceId: ctx.workspaceId,
        kind: "home", title: "Second Brain", icon: "icon:home", databaseId: null,
      });
      ctx.toast({ kind: "info", title: `Focused "${ctx.page.title || "Untitled"}" in the graph` });
    },
  },
];

export const FILE_ACTIONS: PageMenuAction[] = [
  {
    id: "open-with", label: "Open with", icon: AppWindow, scope: "file",
    section: "open", submenu: OPEN_WITH, run: () => {},
  },
  {
    id: "open-to-side", label: "Open to side", icon: PanelRightOpen, scope: "file",
    section: "open",
    run: (ctx) => {
      const layout = ctx.layout.getState();
      layout.splitWith(layout.activePaneId, "row", pageEntryToTab(ctx.page), "after");
    },
  },
  {
    id: "share", label: "Share", icon: Share2, scope: "file", section: "share",
    run: (ctx) =>
      useShareTarget.getState().open({
        workspaceId: ctx.workspaceId, resourceId: ctx.page._id, resourceType: "page",
      }),
  },
  {
    id: "copy-remote-url", label: "Copy remote file url", icon: Link2, scope: "file",
    section: "share",
    run: async (ctx) => {
      await navigator.clipboard.writeText(pageDeepLink(ctx.page._id));
      ctx.toast({ kind: "success", title: "Link copied" });
    },
  },
  {
    id: "export-diagram", label: "Export workspace diagram", icon: ExternalLink,
    scope: "file", section: "export",
    run: (ctx) => {
      const md = buildSubtreeDiagram(ctx.page, ctx.workspacePages());
      const name = (ctx.page.title || "page").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
      downloadText(`${name}-diagram.md`, md);
      ctx.toast({ kind: "success", title: "Workspace diagram exported" });
    },
  },
  {
    id: "select-for-compare", label: "Select for compare", icon: GitCompareArrows,
    scope: "file", section: "vcs",
    run: (ctx) => { ctx.toast({ kind: "info", title: "Version history isn't available in osionos yet" }); },
  },
  {
    id: "open-changes", label: "Open changes", icon: GitBranch, scope: "file", section: "vcs",
    run: (ctx) => { ctx.toast({ kind: "info", title: "Version history isn't available in osionos yet" }); },
  },
  {
    id: "file-history", label: "File history", icon: History, scope: "file", section: "vcs",
    run: (ctx) => { ctx.toast({ kind: "info", title: "Version history isn't available in osionos yet" }); },
  },
];
