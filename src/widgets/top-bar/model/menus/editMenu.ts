/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editMenu.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  copySelection, cutSelection, deleteSelection, duplicateSelection, pastePlainSelection, pasteSelection,
} from "@/features/block-editor/model/blockClipboard";
import type { MenuGroup } from "../menuTypes";
import { blockAction, historyAction, pasteWith } from "./editorActions";
import { palette } from "./menuActions";

/**
 * Edit: history, clipboard and block actions on the active tab's page editor,
 * then the two palettes. Every accelerator here is a chord the automations
 * bind by default (defaultAutomations.ts:13-31).
 */
export function editMenu(): MenuGroup {
  return {
    id: "edit", label: "Edit", items: [
      historyAction({ id: "edit.undo", label: "Undo", accelerator: "Ctrl+Z" }, "undo"),
      historyAction({ id: "edit.redo", label: "Redo", accelerator: "Ctrl+Shift+Z", separatorAfter: true }, "redo"),
      blockAction({ id: "edit.cut", label: "Cut", accelerator: "Ctrl+X" }, true, cutSelection),
      blockAction({ id: "edit.copy", label: "Copy", accelerator: "Ctrl+C" }, true, copySelection),
      blockAction({ id: "edit.paste", label: "Paste", accelerator: "Ctrl+V" }, false, pasteWith(pasteSelection)),
      blockAction({ id: "edit.paste-plain", label: "Paste without formatting", accelerator: "Ctrl+Shift+V", separatorAfter: true }, false, pasteWith(pastePlainSelection)),
      blockAction({ id: "edit.duplicate", label: "Duplicate", accelerator: "Ctrl+D" }, true, duplicateSelection),
      blockAction({ id: "edit.delete", label: "Delete", accelerator: "Del", separatorAfter: true }, true, deleteSelection),
      { id: "edit.find", label: "Find pages…", accelerator: "⌘K", run: () => palette().openSearch() },
      { id: "edit.command", label: "Run command…", accelerator: "⌘⇧P", run: () => palette().openCommand() },
    ],
  };
}
