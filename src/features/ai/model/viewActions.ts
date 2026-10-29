/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   viewActions.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUIStore, isActivePanel } from "@/shared/config/uiStore";
import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { findPane } from "@/widgets/workspace-grid/model/layoutTree";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useUserStore } from "@/features/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function applyViewAction(view: unknown): boolean {
  if (!isObject(view)) return false;
  const action = view.action;
  if (action === "open_page") {
    const pageId = view.pageId;
    const title = view.title;
    const target = view.target;
    if (typeof pageId !== "string" || !UUID_RE.test(pageId) || typeof title !== "string") return false;
    if (target !== "current" && target !== "tab" && target !== "split") return false;

    const layout = useWorkspaceLayout.getState();
    const activePaneId = layout.activePaneId;
    const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
    const tab = pageEntryToTab({
      _id: pageId,
      workspaceId,
      title,
      icon: undefined,
      surface: undefined,
      databaseId: null,
    });

    if (target === "tab") {
      layout.openTab(tab, activePaneId);
      return true;
    }
    if (target === "split") {
      if (!activePaneId) return false;
      layout.splitWith(activePaneId, "row", tab, "after");
      return true;
    }
    // current: replace active tab, or open when pane empty
    if (!activePaneId) return false;
    const pane = findPane(layout.root, activePaneId);
    if (pane && pane.tabs.length > 0) {
      const tabId = pane.activeTabId ?? pane.tabs[0].tabId;
      layout.replaceTabWith(activePaneId, tabId, tab);
    } else {
      layout.openTab(tab, activePaneId);
    }
    return true;
  }

  if (action === "open_panel") {
    const panel = view.panel;
    if (typeof panel !== "string") return false;
    if (!isActivePanel(panel)) return false;
    // expandToPanel, not setActivePanel: a hidden or railed sidebar must show it.
    useUIStore.getState().expandToPanel(panel);
    return true;
  }

  if (action === "open_issue_report") {
    const title = view.title;
    const description = view.description;
    if (typeof title !== "string" || typeof description !== "string") return false;
    useIssueReportRequest.getState().open({ title, description });
    return true;
  }

  return false;
}