import type { EditorHandle } from "@/features/block-editor/model/editorCommandBus";

/** The command vocabulary a shortcut can trigger (existing operations, wrapped). */
export type CommandId =
  | "undo"
  | "redo"
  | "selectAll"
  | "clearSelection"
  | "copy"
  | "cut"
  | "paste"
  | "pastePlain"
  | "duplicate"
  | "delete"
  | "moveBlockUp"
  | "moveBlockDown"
  | "heading1"
  | "heading2"
  | "heading3"
  | "openPalette"
  | "openSearch"
  | "splitPane"
  | "bold"
  | "italic"
  | "underline"
  | "inlineCode"
  | "link";

/** Context-predicate names (the VSCode `when`-clause). */
export type WhenName =
  | "always"
  | "editorFocused"
  | "inTextEntry"
  | "notInText"
  | "hasBlockSelection"
  | "blockSelectionActive"
  | "textFullySelectedOrHasBlockSelection";

/** Snapshot handed to a command / predicate at keypress time. */
export interface CommandContext {
  event: KeyboardEvent;
  handle: EditorHandle | null;
  selection: { ids: readonly string[]; pageId: string | null; sourceKey: string | null };
  activeElement: Element | null;
}

export interface Command {
  id: CommandId;
  title: string;
  category: string;
  run: (ctx: CommandContext) => void;
  /** Extra runtime guard beyond `when` — e.g. undo/redo fall through to native when false. */
  enabled?: (ctx: CommandContext) => boolean;
}

/** A single trigger. Tagged union — open for future button/schedule triggers. */
export type AutomationTrigger = { type: "keyboard"; combo: string; when: WhenName };

/** A single action. Tagged union — open for future set-property/notify actions. */
export type AutomationAction = { type: "run_command"; commandId: CommandId };

/** One automation record = one shortcut: a keyboard trigger → run-command action.
 *  Mirrors the notion-database-sys AutomationRule shape so the two automation
 *  concepts stay consistent; app-owned to avoid the submodule's mirrored types. */
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}
