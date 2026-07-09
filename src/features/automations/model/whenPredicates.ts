import { isTextEntryTarget } from "@/features/block-editor/model/marqueeGeometry";

import type { CommandContext, WhenName } from "./types";

/** True when the whole text of the focused contenteditable is selected (2-stage Ctrl+A). */
function textFullySelected(activeElement: Element | null): boolean {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed) return false;
  const editable = activeElement?.closest('[contenteditable="true"]');
  if (!editable) return false;
  const text = editable.textContent ?? "";
  return text.length > 0 && selection.toString().length >= text.length;
}

/** Each `when` name → a cheap synchronous predicate evaluated at keypress. */
export const whenPredicates: Record<WhenName, (ctx: CommandContext) => boolean> = {
  always: () => true,
  editorFocused: (ctx) => ctx.handle !== null,
  inTextEntry: (ctx) => isTextEntryTarget(ctx.activeElement),
  notInText: (ctx) => !isTextEntryTarget(ctx.activeElement),
  hasBlockSelection: (ctx) => ctx.selection.ids.length > 0,
  blockSelectionActive: (ctx) => ctx.selection.ids.length > 0 && !isTextEntryTarget(ctx.activeElement),
  textFullySelectedOrHasBlockSelection: (ctx) =>
    ctx.selection.ids.length > 0 || textFullySelected(ctx.activeElement),
};
