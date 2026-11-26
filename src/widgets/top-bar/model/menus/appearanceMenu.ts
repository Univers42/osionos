/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appearanceMenu.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { toggleZenWithExitHint, useZenMode } from "@/shared/config/useZenMode";
import { useUIStore } from "@/shared/config/uiStore";
import { workbenchAppearanceMenu } from "@/widgets/workbench/model/workbenchMenuActions";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import type { MenuSubmenu } from "../menuTypes";

/** Tell the user the browser refused full screen (iframe without permission, unsupported). */
function fullscreenRefused(): void {
  useToastStore.getState().push({ kind: "info", title: "Full screen is not available here" });
}

/** Enter full screen, or leave it when already in it. A refusal toasts instead of rejecting unhandled. */
function toggleFullscreen(): void {
  const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  void request.catch(fullscreenRefused);
}

/**
 * View › Appearance: the toggles for the browser and shell regions, each a
 * checkbox row. The side bar is checked only in "panel" mode (the rail mode
 * leaves it collapsed, which `isSidebarOpen` would call open). Full screen
 * carries no accelerator: F11 is the browser's own key, not an app chord.
 */
export function appearanceSubmenu(): MenuSubmenu {
  return {
    id: "view.appearance", label: "Appearance", separatorAfter: true, children: [
      { id: "view.fullscreen", label: "Full screen", run: toggleFullscreen, checked: () => document.fullscreenElement !== null },
      { id: "view.zen", label: "Zen mode", run: toggleZenWithExitHint, checked: () => useZenMode.getState().zen, separatorAfter: true },
      {
        id: "view.sidebar", label: "Primary side bar", accelerator: "Ctrl+Alt+B",
        run: () => useUIStore.getState().toggleDocked(),
        checked: () => useUIStore.getState().sidebarMode === "panel",
      },
      ...workbenchAppearanceMenu(),
    ],
  };
}
