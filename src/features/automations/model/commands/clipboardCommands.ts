import {
  copySelection,
  cutSelection,
  pastePlainSelection,
  pasteSelection,
} from "@/features/block-editor/model/blockClipboard";

import type { Command } from "../types";

/** Clipboard commands delegate to the SAME blockClipboard layer the right-click menu uses. */
export const CLIPBOARD_COMMANDS: Command[] = [
  { id: "copy", title: "Copy", category: "Clipboard", run: (ctx) => { if (ctx.handle) copySelection(ctx.handle, ctx.selection.ids); } },
  { id: "cut", title: "Cut", category: "Clipboard", run: (ctx) => { if (ctx.handle) cutSelection(ctx.handle, ctx.selection.ids); } },
  { id: "paste", title: "Paste", category: "Clipboard", run: (ctx) => { if (ctx.handle) void pasteSelection(ctx.handle, ctx.selection.ids); } },
  { id: "pastePlain", title: "Paste without formatting", category: "Clipboard", run: (ctx) => { if (ctx.handle) void pastePlainSelection(ctx.handle, ctx.selection.ids); } },
];
