/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fileMenu.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { hasLocalTerminal } from "@/features/ide/model/localPty";
import { useQuickCapture } from "@/features/quick-capture/model/useQuickCapture";
import { isQuickCaptureEnabled } from "@/shared/config/featureFlags";
import { openMachineFolder } from "@/widgets/activity-rail/model/panelFocus";
import type { MenuAction, MenuContext, MenuGroup, MenuSubmenu } from "../menuTypes";
import { canCloseActivePane, canCloseActiveTab, closeActivePane, closeActiveTab, palette } from "./menuActions";
import { createPage } from "./newPageAction";

/** Quick capture, offered only while the build ships it. */
function quickCaptureRows(): MenuAction[] {
  if (!isQuickCaptureEnabled()) return [];
  return [{ id: "file.capture", label: "Quick capture", run: () => useQuickCapture.getState().setOpen(true), separatorAfter: true }];
}

/** Open Folder…, offered only where there is no local terminal to open one from. */
function openFolderRows(): MenuAction[] {
  if (hasLocalTerminal()) return [];
  return [{ id: "file.open-folder", label: "Open Folder…", accelerator: "⌘K ⌘O", run: openMachineFolder, separatorAfter: true }];
}

/** Preferences ▸ Settings, Appearance, Keyboard shortcuts, AI: each opens its Settings section. */
function preferencesSubmenu(ctx: MenuContext): MenuSubmenu {
  return {
    id: "file.preferences", label: "Preferences", children: [
      { id: "file.settings", label: "Settings", run: () => ctx.openSettings() },
      { id: "file.appearance", label: "Appearance", run: () => ctx.openSettings("preferences") },
      { id: "file.shortcuts", label: "Keyboard shortcuts", run: () => ctx.openSettings("shortcuts") },
      { id: "file.ai", label: "AI", run: () => ctx.openSettings("ai") },
    ],
  };
}

/**
 * File. Close tab and Close pane are disabled when they would close the whole
 * workspace (the last tab of the last pane, the only pane); their `run` re-checks.
 */
export function fileMenu(ctx: MenuContext): MenuGroup {
  return {
    id: "file", label: "File", items: [
      { id: "file.new-page", label: "New page", run: () => createPage("Untitled") },
      { id: "file.new-folder", label: "New folder", run: () => createPage("New folder", "folder"), separatorAfter: true },
      ...quickCaptureRows(),
      ...openFolderRows(),
      { id: "file.search", label: "Search…", accelerator: "⌘K", run: () => palette().openSearch(), separatorAfter: true },
      { id: "file.close-tab", label: "Close tab", run: closeActiveTab, disabled: () => !canCloseActiveTab() },
      { id: "file.close-pane", label: "Close pane", run: closeActivePane, disabled: () => !canCloseActivePane(), separatorAfter: true },
      preferencesSubmenu(ctx),
    ],
  };
}
