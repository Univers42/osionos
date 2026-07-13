/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menus.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "@/features/auth";
import { isDrawEnabled, isQuickCaptureEnabled } from "@/shared/config/featureFlags";
import { useQuickCapture } from "@/features/quick-capture/model/useQuickCapture";
import { applyTheme, persistThemeMode } from "@/shared/config/theme";
import { useUIStore } from "@/shared/config/uiStore";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";
import type { SettingsTab } from "@/shared/ui/primitives/useSettingsSearchIndex";
import { usePageStore } from "@/store/usePageStore";
import { clearDrawBinding } from "@/widgets/draw-canvas/model/drawHandoff";
import { consoleTab, drawTab, homeTab, trashTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { activeTabOf } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { usePalette } from "./usePalette";

export interface MenuItem {
  id: string;
  label: string;
  /** Display-only accelerator hint; only shown for chords actually bound globally. */
  accelerator?: string;
  run: () => void;
  separatorAfter?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

/** App-level callbacks the menubar needs that live in React state (not a store). */
export interface MenuContext {
  openSettings: (tab?: SettingsTab) => void;
}

const DOCS_URL = "https://github.com/Univers42/osionos";

/**
 * Build the menubar groups. Every item dispatches to an existing store action or
 * the command palette, so nothing here is a dead button. All actions are
 * focus-independent (they never depend on a preserved editor text selection).
 */
export function buildMenus(ctx: MenuContext): MenuGroup[] {
  const layout = () => useWorkspaceLayout.getState();
  const palette = () => usePalette.getState();

  const createPage = (title: string, surface?: "folder") => {
    const user = useUserStore.getState();
    const workspace = user.activeWorkspace();
    const jwt = user.activePageJwt() ?? "";
    if (!workspace) return;
    const options = surface ? { surface } : undefined;
    void usePageStore.getState().addPage(workspace._id, title, jwt, undefined, options).then((page) => {
      if (!page) return;
      if (surface) useToastStore.getState().push({ kind: "success", title: "Folder created" });
      else usePageStore.getState().openPage({ id: page._id, workspaceId: workspace._id, kind: "page", title: page.title });
    });
  };

  const closeActiveTab = () => {
    const state = layout();
    const tab = activeTabOf(state.root, state.activePaneId);
    if (tab) state.closeTab(state.activePaneId, tab.tabId);
  };

  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    persistThemeMode(next);
  };

  return [
    {
      id: "file", label: "File", items: [
        { id: "file.new-page", label: "New page", run: () => createPage("Untitled") },
        { id: "file.new-folder", label: "New folder", run: () => createPage("New folder", "folder"), separatorAfter: true },
        ...(isQuickCaptureEnabled()
          ? [{ id: "file.capture", label: "Quick capture", run: () => useQuickCapture.getState().setOpen(true), separatorAfter: true }]
          : []),
        { id: "file.search", label: "Search…", accelerator: "⌘K", run: () => palette().openSearch(), separatorAfter: true },
        { id: "file.settings", label: "Settings", run: ctx.openSettings },
      ],
    },
    {
      id: "edit", label: "Edit", items: [
        { id: "edit.find", label: "Find pages…", accelerator: "⌘K", run: () => palette().openSearch() },
        { id: "edit.command", label: "Run command…", accelerator: "⌘⇧P", run: () => palette().openCommand() },
      ],
    },
    {
      id: "selection", label: "Selection", items: [
        { id: "sel.split-right", label: "Split editor right", accelerator: "⌘\\", run: () => layout().splitActivePane(layout().activePaneId, "row") },
        { id: "sel.split-down", label: "Split editor down", run: () => layout().splitActivePane(layout().activePaneId, "column"), separatorAfter: true },
        { id: "sel.close-pane", label: "Close pane", run: () => layout().closePane(layout().activePaneId) },
        { id: "sel.close-tab", label: "Close tab", run: closeActiveTab },
      ],
    },
    {
      id: "view", label: "View", items: [
        { id: "view.sidebar", label: "Toggle sidebar", run: () => useUIStore.getState().toggleSidebar() },
        { id: "view.theme", label: "Toggle theme", run: toggleTheme, separatorAfter: true },
        { id: "view.home", label: "Home", run: () => layout().openTab(homeTab()) },
        { id: "view.trash", label: "Trash", run: () => layout().openTab(trashTab()) },
        { id: "view.console", label: "BaaS Console", run: () => layout().openTab(consoleTab()) },
        ...(isDrawEnabled()
          ? [{
              id: "view.draw",
              label: "New drawing",
              // Unbind first: a blank drawing must not write into the draw BLOCK
              // that last expanded into this (singleton) tab.
              run: () => { clearDrawBinding(); layout().openTab(drawTab()); },
            }]
          : []),
      ],
    },
    {
      id: "help", label: "Help", items: [
        { id: "help.docs", label: "Documentation", run: () => { globalThis.open(DOCS_URL, "_blank", "noopener"); } },
        { id: "help.shortcuts", label: "Keyboard shortcuts", run: () => ctx.openSettings("shortcuts") },
        { id: "help.about", label: "About osionos", run: () => useToastStore.getState().push({ kind: "info", title: "osionos", description: "Notion-style collaborative workspace" }) },
      ],
    },
  ];
}
