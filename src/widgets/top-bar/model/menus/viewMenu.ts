/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   viewMenu.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isWhiteboardEnabled } from "@/shared/config/featureFlags";
import { whiteboardAppUrl } from "@/shared/config/appUrls";
import { isThemeBasePinned, toggleThemeMode } from "@/shared/config/theme";
import { consoleTab, homeTab, trashTab, whiteboardTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { toggleAndFocusPanel } from "@/widgets/activity-rail/model/panelFocus";
import { workbenchViewMenu } from "@/widgets/workbench/model/workbenchMenuActions";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import type { MenuAction, MenuGroup } from "../menuTypes";
import { whiteboardViewItems } from "../whiteboardMenuItems";
import { appearanceSubmenu } from "./appearanceMenu";
import { layout, openTabAction, palette } from "./menuActions";

/** The quick light/dark flip, which says why it does nothing while the active theme sets the mode. */
function toggleThemeFromMenu(): void {
  if (!isThemeBasePinned()) {
    toggleThemeMode();
    return;
  }
  useToastStore.getState().push({
    kind: "info",
    title: "Your theme sets light or dark",
    description: "Choose another theme in Settings › Preferences to switch.",
  });
}

/**
 * The Whiteboard row. Two gates, not one: the flag is the kill-switch, the URL
 * is the capability. A build with VITE_WHITEBOARD_APP_URL blanked cannot load
 * the embed at all, so the row is withheld rather than offered and then failing.
 */
function whiteboardRows(): MenuAction[] {
  return whiteboardViewItems(isWhiteboardEnabled() && whiteboardAppUrl() !== "", () => layout().openTab(whiteboardTab()));
}

/** View › Explorer, Search, Source Control: each opens its panel, or hides the side bar when it is the one showing. */
function sidebarPanelRows(): MenuAction[] {
  return [
    { id: "view.explorer", label: "Explorer", accelerator: "Ctrl+Shift+E", run: () => toggleAndFocusPanel("files") },
    { id: "view.search-panel", label: "Search", accelerator: "Ctrl+Shift+F", run: () => toggleAndFocusPanel("search") },
    { id: "view.scm", label: "Source Control", accelerator: "Ctrl+Shift+G", run: () => toggleAndFocusPanel("scm"), separatorAfter: true },
  ];
}

/**
 * View. The side bar, Panel and Status bar toggles live once, under Appearance;
 * the old flat rows for them are gone so one action has one row.
 */
export function viewMenu(): MenuGroup {
  return {
    id: "view", label: "View", items: [
      { id: "view.palette", label: "Command palette…", accelerator: "⌘⇧P", run: () => palette().openCommand(), separatorAfter: true },
      ...sidebarPanelRows(),
      appearanceSubmenu(),
      { id: "view.theme", label: "Toggle theme", run: toggleThemeFromMenu, separatorAfter: true },
      ...workbenchViewMenu(),
      openTabAction("view.home", "Home", homeTab),
      openTabAction("view.trash", "Trash", trashTab),
      openTabAction("view.console", "BaaS Console", consoleTab),
      ...whiteboardRows(),
    ],
  };
}
