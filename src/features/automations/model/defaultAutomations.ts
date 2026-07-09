import type { Automation, CommandId, WhenName } from "./types";

function shortcut(id: string, name: string, combo: string, commandId: CommandId, when: WhenName, enabled = true): Automation {
  return { id, name, enabled, trigger: { type: "keyboard", combo, when }, actions: [{ type: "run_command", commandId }] };
}

/**
 * The ~25 seeded shortcut automations. `mod` = Ctrl (non-mac) / Cmd (mac). The inline
 * format shortcuts (bold/italic/…) ship DISABLED so the editor keeps handling them
 * natively; they are visible + rebindable in the manager.
 */
export const DEFAULT_AUTOMATIONS: Automation[] = [
  shortcut("undo", "Undo", "mod+z", "undo", "editorFocused"),
  shortcut("redo", "Redo", "mod+shift+z", "redo", "editorFocused"),
  shortcut("redo-y", "Redo (alt)", "mod+y", "redo", "editorFocused"),
  shortcut("select-all", "Select all blocks", "mod+a", "selectAll", "textFullySelectedOrHasBlockSelection"),
  shortcut("clear-selection", "Clear selection", "escape", "clearSelection", "hasBlockSelection"),
  shortcut("copy", "Copy", "mod+c", "copy", "blockSelectionActive"),
  shortcut("cut", "Cut", "mod+x", "cut", "blockSelectionActive"),
  shortcut("paste", "Paste", "mod+v", "paste", "notInText"),
  shortcut("paste-plain", "Paste without formatting", "mod+shift+v", "pastePlain", "notInText"),
  shortcut("duplicate", "Duplicate", "mod+d", "duplicate", "blockSelectionActive"),
  shortcut("delete", "Delete selection", "delete", "delete", "blockSelectionActive"),
  shortcut("delete-backspace", "Delete selection (Backspace)", "backspace", "delete", "blockSelectionActive"),
  shortcut("move-up", "Move block up", "mod+shift+arrowup", "moveBlockUp", "editorFocused"),
  shortcut("move-down", "Move block down", "mod+shift+arrowdown", "moveBlockDown", "editorFocused"),
  shortcut("heading-1", "Heading 1", "mod+alt+1", "heading1", "editorFocused"),
  shortcut("heading-2", "Heading 2", "mod+alt+2", "heading2", "editorFocused"),
  shortcut("heading-3", "Heading 3", "mod+alt+3", "heading3", "editorFocused"),
  shortcut("open-palette", "Command palette", "mod+shift+p", "openPalette", "always"),
  shortcut("open-search", "Search", "mod+k", "openSearch", "always"),
  shortcut("split-pane", "Split pane right", "mod+\\", "splitPane", "always"),
  shortcut("bold", "Bold", "mod+b", "bold", "inTextEntry", false),
  shortcut("italic", "Italic", "mod+i", "italic", "inTextEntry", false),
  shortcut("underline", "Underline", "mod+u", "underline", "inTextEntry", false),
  shortcut("inline-code", "Inline code", "mod+e", "inlineCode", "inTextEntry", false),
  shortcut("link", "Link", "mod+shift+k", "link", "inTextEntry", false),
];
