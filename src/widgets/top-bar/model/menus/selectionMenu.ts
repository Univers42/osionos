/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectionMenu.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { MenuGroup } from "../menuTypes";
import { blockAction, moveAction } from "./editorActions";
import { layout } from "./menuActions";

/**
 * Selection: select and move blocks, and split the editor. Close pane and Close
 * tab live in File alone. Move block carries the chord the automations bind
 * (Ctrl+Shift+arrow, defaultAutomations.ts:25-26), not the Alt+arrow the draft named.
 */
export function selectionMenu(): MenuGroup {
  return {
    id: "selection", label: "Selection", items: [
      blockAction({ id: "sel.select-all", label: "Select all", accelerator: "Ctrl+A", separatorAfter: true }, false, (handle) => handle.selectAll()),
      moveAction({ id: "sel.move-up", label: "Move block up", accelerator: "Ctrl+Shift+↑" }, "up"),
      moveAction({ id: "sel.move-down", label: "Move block down", accelerator: "Ctrl+Shift+↓", separatorAfter: true }, "down"),
      { id: "sel.split-right", label: "Split editor right", accelerator: "⌘\\", run: () => layout().splitActivePane(layout().activePaneId, "row") },
      { id: "sel.split-down", label: "Split editor down", run: () => layout().splitActivePane(layout().activePaneId, "column") },
    ],
  };
}
