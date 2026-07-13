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
import { pruneTabsForPages, removePane, setSizes, splitPane } from "./layoutMutations";
import { freshLayout, layoutScope, loadLayout, saveLayout } from "./layoutPersist";
import { activePageToTab } from "./pageToTab";
import { mirrorActiveTab } from "./layoutSync";

interface LayoutState {
  root: LayoutNode;
  activePaneId: string;
  /** The `user:workspace` identity this tree BELONGS to ("" = nobody → never
   *  persisted). Saves always target this scope, so a commit that fires in the
   *  middle of a user/workspace switch can never write these tabs into the
   *  incoming identity's slot. */
  scope: string;
  /** openPage handoff: reflect the legacy active page as a tab (no mirror-back). */
  syncFromActivePage: (page: ActivePage) => void;
  openTab: (tab: WorkspaceTab, paneId?: string) => void;
  /** Insert a tab at a specific index in a pane (file→tab-strip drop). */
  openTabAt: (tab: WorkspaceTab, paneId: string, index: number) => void;
  /** Swap the tab at `tabId` for `tab` in place (file→tab "replace" drop). */
  replaceTabWith: (paneId: string, tabId: string, tab: WorkspaceTab) => void;
  closeTab: (paneId: string, tabId: string) => void;
  setActiveTab: (paneId: string, tabId: string) => void;
  setActivePane: (paneId: string) => void;
  moveTab: (fromPaneId: string, tabId: string, toPaneId: string, index?: number) => void;
  splitWith: (paneId: string, direction: "row" | "column", tab: WorkspaceTab, side: "before" | "after") => void;
  splitMoveTab: (fromPaneId: string, tabId: string, targetPaneId: string, direction: "row" | "column", side: "before" | "after") => void;
  splitActivePane: (paneId: string, direction: "row" | "column") => void;
  closePane: (paneId: string) => void;
  resize: (splitId: string, sizes: number[]) => void;
  /** Drop all open tabs/splits back to a single fresh home pane (used on account switch). */
  reset: () => void;
  /** Load the persisted layout OWNED by (user, workspace) — called on auth resolve and
   *  on every user/workspace switch, so no identity ever inherits another's open tabs. */
  restoreForScope: (userId: string, workspaceId: string) => void;
  /** Close every open tab whose pageId is in the set — a page that was archived
   *  (deleted → trash) or removed must not linger in the tab bar. Emptied panes
   *  collapse; a fully-emptied tree falls back to a fresh Home. */
  closeTabsForPages: (pageIds: Set<string>) => void;
  /** Refresh title/icon on every open tab of a page (rename / icon change) so the
   *  tab strip never shows a stale snapshot — and a stale snapshot can never flow
   *  back over the live title when the tab is refocused. */
  updateTabsForPage: (pageId: string, patch: { title?: string; icon?: string }) => void;
}

export const useWorkspaceLayout = create<LayoutState>((set, get) => {
  /** Commit a new tree, persist it under ITS OWN scope, and (optionally) mirror
   *  the active tab. */
  function commit(root: LayoutNode, activePaneId: string, mirror: WorkspaceTab | null | false): void {
    set({ root, activePaneId });
    saveLayout({ root, activePaneId }, get().scope);
    if (mirror !== false) mirrorActiveTab(mirror);
  }

  function focusInPane(paneId: string, tabId: string, mirror: boolean): void {
    const root = updatePane(get().root, paneId, (pane) => ({ ...pane, activeTabId: tabId }));
    commit(root, paneId, mirror ? activeTabOf(root, paneId) : false);
  }

  return {
    // Boot state is a fresh unowned layout (scope "") — never persisted. The real
    // slot loads once usePageSync resolves the signed-in user + active workspace.
    ...freshLayout(),
    scope: "",
    reset: () => {
      const fresh = freshLayout();
      set(fresh);
      saveLayout(fresh, get().scope);
    },

    updateTabsForPage: (pageId, patch) => {
      const state = get();
      let root = state.root;
      let changed = false;
      for (const pane of collectPanes(state.root)) {
        if (!pane.tabs.some((tab) => tab.pageId === pageId)) continue;
        changed = true;
        root = updatePane(root, pane.id, (p) => ({
          ...p,
          tabs: p.tabs.map((tab) => (tab.pageId === pageId ? { ...tab, ...patch } : tab)),
        }));
      }
      if (changed) commit(root, state.activePaneId, false);
    },

    restoreForScope: (userId, workspaceId) => {
      // Read the (user, workspace) slot; loadLayout returns a fresh single-Home
      // layout when that identity has none, so nobody ever inherits foreign tabs.
      const scope = layoutScope(userId, workspaceId);
      set({ scope, ...loadLayout(scope) });
    },

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

    openTabAt: (tab, paneId, index) => {
      // A drop is an explicit PLACEMENT gesture: if the page is already open we
      // MOVE/reorder it to the drop slot (not silently refocus it elsewhere).
      const state = get();
      const target = findPane(state.root, paneId) ? paneId : state.activePaneId;
      const existing = findOpenTab(state.root, tab.pageId);
      if (existing) return get().moveTab(existing.paneId, existing.tab.tabId, target, index);
      const root = updatePane(state.root, target, (p) => {
        const tabs = [...p.tabs];
        tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
        return { ...p, tabs, activeTabId: tab.tabId };
      });
      commit(root, target, tab);
    },

    replaceTabWith: (paneId, tabId, tab) => {
      // Swap the hovered tab for the dragged page in place. If that page is
      // already open in a *different* tab, drop the stale duplicate first so the
      // page lands exactly where the user aimed (explicit placement gesture).
      const state = get();
      const pane = findPane(state.root, paneId);
      if (!pane) return;
      const existing = findOpenTab(state.root, tab.pageId);
      let working = state.root;
      if (existing && existing.tab.tabId !== tabId) {
        working = updatePane(working, existing.paneId, (p) => {
          const tabs = p.tabs.filter((t) => t.tabId !== existing.tab.tabId);
          return { ...p, tabs, activeTabId: p.activeTabId === existing.tab.tabId ? (tabs[0]?.tabId ?? null) : p.activeTabId };
        });
      }
      const liveTarget = findPane(working, paneId);
      const index = liveTarget ? liveTarget.tabs.findIndex((t) => t.tabId === tabId) : -1;
      if (index === -1) return;
      const root = updatePane(working, paneId, (p) => {
        const tabs = [...p.tabs];
        tabs[index] = tab;
        return { ...p, tabs, activeTabId: tab.tabId };
      });
      commit(root, paneId, tab);
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

    closeTabsForPages: (pageIds) => {
      if (pageIds.size === 0) return;
      const state = get();
      const result = pruneTabsForPages(state.root, state.activePaneId, (t) => Boolean(t.pageId) && pageIds.has(t.pageId));
      if (result === null) return; // no open tab matched
      if (result === "empty") {
        const fresh = freshLayout();
        return commit(fresh.root, fresh.activePaneId, activeTabOf(fresh.root, fresh.activePaneId));
      }
      commit(result.root, result.activePaneId, activeTabOf(result.root, result.activePaneId));
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
