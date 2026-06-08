/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceLayout.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import type { ActivePage } from "@/entities/page";
import {
  activeTabOf, collectPanes, findOpenTab, findPane, genId, updatePane,
  type LayoutNode, type PaneNode, type WorkspaceTab,
} from "./layoutTree";
import { removePane, setSizes, splitPane } from "./layoutMutations";
import { freshLayout, loadLayout, saveLayout } from "./layoutPersist";
import { activePageToTab } from "./pageToTab";
import { mirrorActiveTab } from "./layoutSync";

interface LayoutState {
  root: LayoutNode;
  activePaneId: string;
  /** openPage handoff: reflect the legacy active page as a tab (no mirror-back). */
  syncFromActivePage: (page: ActivePage) => void;
  openTab: (tab: WorkspaceTab, paneId?: string) => void;
  closeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  setActivePane: (paneId: string) => void;
  moveTab: (fromPaneId: string, tabId: string, toPaneId: string, index?: number) => void;
  splitWith: (paneId: string, direction: "row" | "column", tab: WorkspaceTab, side: "before" | "after") => void;
  splitMoveTab: (fromPaneId: string, tabId: string, targetPaneId: string, direction: "row" | "column", side: "before" | "after") => void;
  splitActivePane: (paneId: string, direction: "row" | "column") => void;
  closePane: (paneId: string) => void;
  resize: (splitId: string, sizes: number[]) => void;
}

export const useWorkspaceLayout = create<LayoutState>((set, get) => {
  /** Commit a new tree, persist it, and (optionally) mirror the active tab. */
  function commit(root: LayoutNode, activePaneId: string, mirror: WorkspaceTab | null | false): void {
    set({ root, activePaneId });
    saveLayout({ root, activePaneId });
    if (mirror !== false) mirrorActiveTab(mirror);
  }

  function focusInPane(paneId: string, tabId: string, mirror: boolean): void {
    const root = updatePane(get().root, paneId, (pane) => ({ ...pane, activeTabId: tabId }));
    commit(root, paneId, mirror ? activeTabOf(root, paneId) : false);
  }

  return {
    ...loadLayout(),

    syncFromActivePage: (page) => {
      const state = get();
      const existing = findOpenTab(state.root, page.id);
      if (existing) return focusInPane(existing.paneId, existing.tab.tabId, false);
      const tab = activePageToTab(page);
      const root = updatePane(state.root, state.activePaneId, (p) => ({ ...p, tabs: [...p.tabs, tab], activeTabId: tab.tabId }));
      commit(root, state.activePaneId, false);
    },

    openTab: (tab, paneId) => {
      const state = get();
      const existing = findOpenTab(state.root, tab.pageId);
      if (existing) return focusInPane(existing.paneId, existing.tab.tabId, true);
      const target = paneId && findPane(state.root, paneId) ? paneId : state.activePaneId;
      const root = updatePane(state.root, target, (p) => ({ ...p, tabs: [...p.tabs, tab], activeTabId: tab.tabId }));
      commit(root, target, tab);
    },

    closeTab: (paneId, tabId) => {
      const state = get();
      const pane = findPane(state.root, paneId);
      if (!pane) return;
      const closingIndex = pane.tabs.findIndex((t) => t.tabId === tabId);
      const remaining = pane.tabs.filter((t) => t.tabId !== tabId);
      if (remaining.length > 0) {
        const nextActive = pane.activeTabId === tabId
          ? (remaining[Math.max(0, closingIndex - 1)]?.tabId ?? remaining[0].tabId)
          : pane.activeTabId;
        const root = updatePane(state.root, paneId, (p) => ({ ...p, tabs: remaining, activeTabId: nextActive }));
        return commit(root, state.activePaneId, activeTabOf(root, state.activePaneId));
      }
      const removed = removePane(state.root, paneId);
      if (!removed) { const fresh = freshLayout(); return commit(fresh.root, fresh.activePaneId, activeTabOf(fresh.root, fresh.activePaneId)); }
      const activePaneId = findPane(removed, state.activePaneId) ? state.activePaneId : (collectPanes(removed)[0]?.id ?? "");
      commit(removed, activePaneId, activeTabOf(removed, activePaneId));
    },

    setActiveTab: (paneId, tabId) => focusInPane(paneId, tabId, true),

    setActivePane: (paneId) => {
      if (get().activePaneId === paneId) return;
      const { root } = get();
      commit(root, paneId, activeTabOf(root, paneId));
    },

    moveTab: (fromPaneId, tabId, toPaneId, index) => {
      const state = get();
      const moved = findPane(state.root, fromPaneId)?.tabs.find((t) => t.tabId === tabId);
      if (!moved) return;
      let root = updatePane(state.root, fromPaneId, (p) => {
        const tabs = p.tabs.filter((t) => t.tabId !== tabId);
        return { ...p, tabs, activeTabId: p.activeTabId === tabId ? (tabs[0]?.tabId ?? null) : p.activeTabId };
      });
      root = updatePane(root, toPaneId, (p) => {
        const tabs = [...p.tabs];
        tabs.splice(index === undefined ? tabs.length : Math.max(0, Math.min(index, tabs.length)), 0, moved);
        return { ...p, tabs, activeTabId: moved.tabId };
      });
      if (fromPaneId !== toPaneId && findPane(root, fromPaneId)?.tabs.length === 0) {
        root = removePane(root, fromPaneId) ?? root;
      }
      commit(root, toPaneId, moved);
    },

    splitWith: (paneId, direction, tab, side) => {
      const newPane: PaneNode = { type: "pane", id: genId("pane"), tabs: [tab], activeTabId: tab.tabId };
      const root = splitPane(get().root, paneId, direction, newPane, side);
      commit(root, newPane.id, tab);
    },

    splitMoveTab: (fromPaneId, tabId, targetPaneId, direction, side) => {
      const state = get();
      const moved = findPane(state.root, fromPaneId)?.tabs.find((t) => t.tabId === tabId);
      if (!moved) return;
      const newPane: PaneNode = { type: "pane", id: genId("pane"), tabs: [moved], activeTabId: moved.tabId };
      let root = splitPane(state.root, targetPaneId, direction, newPane, side);
      root = updatePane(root, fromPaneId, (p) => {
        const tabs = p.tabs.filter((t) => t.tabId !== tabId);
        return { ...p, tabs, activeTabId: p.activeTabId === tabId ? (tabs[0]?.tabId ?? null) : p.activeTabId };
      });
      if (findPane(root, fromPaneId)?.tabs.length === 0) root = removePane(root, fromPaneId) ?? root;
      commit(root, newPane.id, moved);
    },

    splitActivePane: (paneId, direction) => {
      const pane = findPane(get().root, paneId);
      const active = pane?.tabs.find((t) => t.tabId === pane.activeTabId) ?? pane?.tabs[0];
      if (!active) return;
      get().splitWith(paneId, direction, { ...active, tabId: genId("tab") }, "after");
    },

    closePane: (paneId) => {
      const removed = removePane(get().root, paneId);
      if (!removed) { const fresh = freshLayout(); return commit(fresh.root, fresh.activePaneId, activeTabOf(fresh.root, fresh.activePaneId)); }
      const activePaneId = collectPanes(removed)[0]?.id ?? "";
      commit(removed, activePaneId, activeTabOf(removed, activePaneId));
    },

    resize: (splitId, sizes) => {
      const root = setSizes(get().root, splitId, sizes);
      commit(root, get().activePaneId, false);
    },
  };
});
