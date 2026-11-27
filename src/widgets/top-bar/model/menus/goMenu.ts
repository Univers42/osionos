/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   goMenu.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  aiHubTab, chatTab, collabTab, homeTab, libraryTab, messagesTab, trashTab,
} from "@/widgets/workspace-grid/model/layoutPersist";
import { collectPanes } from "@/widgets/workspace-grid/model/layoutTree";
import { canGoInHistory, useNavHistory } from "@/widgets/workspace-grid/model/useNavHistory";
import type { MenuAction, MenuGroup } from "../menuTypes";
import { cycleTabAction, layout, openTabAction, palette } from "./menuActions";

/** Go › Switch group rows: Ctrl+1/2/3 focus editor group 1/2/3, disabled while that group is not open. */
function groupAction(position: number): MenuAction {
  const paneId = (): string | undefined => collectPanes(layout().root)[position - 1]?.id;
  return {
    id: `go.group-${position}`, label: `Group ${position}`, accelerator: `Ctrl+${position}`,
    disabled: () => paneId() === undefined,
    run: () => {
      const id = paneId();
      if (id) layout().setActivePane(id);
    },
  };
}

/**
 * Go: back and forward through the pages visited, jump to a page (Ctrl+P),
 * step between the tabs of the active pane, open a top-level tab. Next and
 * Previous tab carry no accelerator: Ctrl+Tab is the browser's own and cannot
 * be bound. Back and Forward are disabled while no existing page lies that way.
 */
export function goMenu(): MenuGroup {
  return {
    id: "go", label: "Go", items: [
      { id: "go.back", label: "Back", accelerator: "Alt+←", disabled: () => !canGoInHistory(-1), run: () => useNavHistory.getState().go(-1) },
      { id: "go.forward", label: "Forward", accelerator: "Alt+→", disabled: () => !canGoInHistory(1), run: () => useNavHistory.getState().go(1), separatorAfter: true },
      { id: "go.page", label: "Go to page…", accelerator: "Ctrl+P", run: () => palette().openSearch() },
      { id: "go.groups", label: "Switch group", separatorAfter: true, children: [groupAction(1), groupAction(2), groupAction(3)] },
      cycleTabAction({ id: "go.next-tab", label: "Next tab" }, 1),
      cycleTabAction({ id: "go.prev-tab", label: "Previous tab", separatorAfter: true }, -1),
      openTabAction("go.home", "Home", homeTab),
      openTabAction("go.library", "Library", libraryTab),
      openTabAction("go.messages", "Messages", messagesTab),
      openTabAction("go.assistant", "Assistant", chatTab),
      openTabAction("go.ai-hub", "AI hub", aiHubTab),
      openTabAction("go.discover", "Discover", collabTab),
      openTabAction("go.trash", "Trash", trashTab),
    ],
  };
}
