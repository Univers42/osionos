/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   viewContext.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ActivePanel } from "@/shared/config/uiStore";
import { useUIStore } from "@/shared/config/uiStore";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import {
  collectPanes,
  findPane,
  activeTabOf,
  type LayoutNode,
} from "@/widgets/workspace-grid/model/layoutTree";

export interface RunViewActivePage {
  id: string;
  title: string;
}

export interface RunViewTab {
  title: string;
  kind: "page" | "database" | "app" | "other";
  pageId?: string;
}

export interface RunView {
  route: string;
  layout: "single" | "split";
  activePage?: RunViewActivePage;
  tabs?: RunViewTab[];
  panel?: ActivePanel | "issues";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapKind(kind: string): RunViewTab["kind"] {
  if (kind === "database") return "database";
  if (kind === "page" || kind === "home" || kind === "folder") return "page";
  if (kind === "app") return "app";
  return "other";
}

export function buildRunView(input: {
  pathname: string;
  layoutRoot: LayoutNode;
  activePaneId: string | null;
  activePage: { id: string; title: string } | null;
  panel: ActivePanel | null;
}): RunView {
  const route = (input.pathname ?? "").slice(0, 200);
  const panes = collectPanes(input.layoutRoot);
  const layout: RunView["layout"] = panes.length > 1 ? "split" : "single";

  const activePane =
    input.activePaneId && findPane(input.layoutRoot, input.activePaneId)
      ? findPane(input.layoutRoot, input.activePaneId)
      : panes[0] ?? null;

  const ordered = activePane ? [activePane, ...panes.filter((p) => p !== activePane)] : panes;

  const tabs: RunViewTab[] = [];
  for (const pane of ordered) {
    for (const tab of pane.tabs) {
      if (tabs.length >= 8) break;
      const entry: RunViewTab = {
        title: (tab.title ?? "").slice(0, 120),
        kind: mapKind(tab.kind),
      };
      if (isUuid(tab.pageId)) entry.pageId = tab.pageId;
      tabs.push(entry);
    }
    if (tabs.length >= 8) break;
  }

  const view: RunView = { route, layout };
  if (input.activePage) {
    view.activePage = {
      id: input.activePage.id,
      title: (input.activePage.title ?? "").slice(0, 120),
    };
  }
  if (tabs.length > 0) view.tabs = tabs;
  if (input.panel) view.panel = input.panel;
  return view;
}

export function buildCurrentRunView(): RunView {
  const layout = useWorkspaceLayout.getState();
  const ui = useUIStore.getState();
  const pageStore = usePageStore.getState();

  const activePane =
    layout.activePaneId && findPane(layout.root, layout.activePaneId)
      ? findPane(layout.root, layout.activePaneId)
      : collectPanes(layout.root)[0] ?? null;

  const activeTab = activePane ? activeTabOf(layout.root, activePane.id) : null;

  let activePage: { id: string; title: string } | null = null;
  if (activeTab?.pageId && isUuid(activeTab.pageId)) {
    activePage = { id: activeTab.pageId, title: activeTab.title ?? "" };
  } else if (pageStore.activePage) {
    activePage = { id: pageStore.activePage.id, title: pageStore.activePage.title ?? "" };
  }

  const pathname =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

  return buildRunView({
    pathname,
    layoutRoot: layout.root,
    activePaneId: layout.activePaneId,
    activePage,
    panel: ui.activePanel,
  });
}

export function useRunView(): () => RunView {
  return () => buildCurrentRunView();
}