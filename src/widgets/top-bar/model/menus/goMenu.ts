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
import type { MenuGroup } from "../menuTypes";
import { cycleTabAction, openTabAction, palette } from "./menuActions";

/**
 * Go: jump to a page, step between the tabs of the active pane, open a
 * top-level tab. Next and Previous tab carry no accelerator: Ctrl+Tab is the
 * browser's own and cannot be bound, and Go to page has no ⌘P binding today.
 */
export function goMenu(): MenuGroup {
  return {
    id: "go", label: "Go", items: [
      { id: "go.page", label: "Go to page…", run: () => palette().openSearch(), separatorAfter: true },
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
