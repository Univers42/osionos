import type { InlineFormatCommand } from "@/features/block-editor/model/editorCommandBus";

import type { Command, CommandId } from "../types";

/** Inline-format commands. Default automations for these ship DISABLED — they no-op
 *  until an editor registers `applyInlineFormat` on its handle, so enabling one is
 *  safe (it does nothing) rather than double-toggling the editor's native mod+b/i/u. */
function formatCommand(id: CommandId, title: string, kind: InlineFormatCommand): Command {
  return { id, title, category: "Format", run: (ctx) => ctx.handle?.applyInlineFormat?.(kind) };
}

export const FORMAT_COMMANDS: Command[] = [
  formatCommand("bold", "Bold", "bold"),
  formatCommand("italic", "Italic", "italic"),
  formatCommand("underline", "Underline", "underline"),
  formatCommand("inlineCode", "Inline code", "code"),
  formatCommand("link", "Link", "link"),
];
