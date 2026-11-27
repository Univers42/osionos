/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shellCommands.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { toggleAndFocusPanel } from "@/widgets/activity-rail/model/panelFocus";
import { collectPanes } from "@/widgets/workspace-grid/model/layoutTree";
import { useNavHistory } from "@/widgets/workspace-grid/model/useNavHistory";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { Command, CommandId } from "../types";

/** The id of the nth editor group (1-based), or null when fewer panes are open. */
function paneIdAt(position: number): string | null {
  return collectPanes(useWorkspaceLayout.getState().root)[position - 1]?.id ?? null;
}

/** Focus editor group `position`; disabled with fewer panes so the browser keeps the key. */
function focusEditorGroup(id: CommandId, position: number): Command {
  return {
    id,
    title: `Focus editor group ${position}`,
    category: "App",
    enabled: () => paneIdAt(position) !== null,
    run: () => {
      const paneId = paneIdAt(position);
      if (paneId) useWorkspaceLayout.getState().setActivePane(paneId);
    },
  };
}

/** The VS Code shell commands: view toggles, Go back / forward, editor group focus. */
export const SHELL_COMMANDS: Command[] = [
  { id: "toggleExplorerPanel", title: "Explorer", category: "App", run: () => toggleAndFocusPanel("files") },
  { id: "toggleScmPanel", title: "Source Control", category: "App", run: () => toggleAndFocusPanel("scm") },
  { id: "goBack", title: "Go back", category: "App", run: () => useNavHistory.getState().go(-1) },
  { id: "goForward", title: "Go forward", category: "App", run: () => useNavHistory.getState().go(1) },
  focusEditorGroup("focusEditorGroup1", 1),
  focusEditorGroup("focusEditorGroup2", 2),
  focusEditorGroup("focusEditorGroup3", 3),
];
