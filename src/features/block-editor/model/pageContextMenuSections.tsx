import { ClipboardPaste, Copy, CopyPlus, Scissors, Trash2 } from "lucide-react";

import type { BlockContextMenuSection } from "./blockContextMenu.helpers";
import type { EditorHandle } from "./editorCommandBus";
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  pastePlainSelection,
  pasteSelection,
} from "./blockClipboard";

/**
 * The right-click menu for a block selection: cut / copy / paste / paste-without-
 * formatting / duplicate / delete. Every item calls the SAME blockClipboard action
 * the keyboard automations use. Paste is always enabled (it inserts at the end when
 * nothing is selected); the rest are disabled with no selection.
 */
export function buildSelectionMenuSections(
  handle: EditorHandle,
  ids: readonly string[],
  close: () => void,
): BlockContextMenuSection[] {
  const hasSelection = ids.length > 0;
  const run = (fn: () => void | Promise<void>) => () => {
    close();
    void fn();
  };
  return [
    {
      items: [
        { icon: <Copy size={16} />, label: "Copy", shortcut: "Ctrl+C", disabled: !hasSelection, onClick: run(() => copySelection(handle, ids)) },
        { icon: <Scissors size={16} />, label: "Cut", shortcut: "Ctrl+X", disabled: !hasSelection, onClick: run(() => cutSelection(handle, ids)) },
        { icon: <ClipboardPaste size={16} />, label: "Paste", shortcut: "Ctrl+V", onClick: run(() => pasteSelection(handle, ids)) },
        { icon: <ClipboardPaste size={16} />, label: "Paste without formatting", shortcut: "Ctrl+Shift+V", onClick: run(() => pastePlainSelection(handle, ids)) },
      ],
    },
    {
      items: [
        { icon: <CopyPlus size={16} />, label: "Duplicate", shortcut: "Ctrl+D", disabled: !hasSelection, onClick: run(() => duplicateSelection(handle, ids)) },
        { icon: <Trash2 size={16} />, label: "Delete", shortcut: "Del", danger: true, disabled: !hasSelection, onClick: run(() => deleteSelection(handle, ids)) },
      ],
    },
  ];
}
