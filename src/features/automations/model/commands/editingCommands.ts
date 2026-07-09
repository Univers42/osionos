import type { Block, BlockType } from "@/entities/block";
import { changeBlockTypeInTree, moveBlockInTree } from "@/features/block-editor/model/blockContextMenu.helpers";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { deleteSelection, duplicateSelection } from "@/features/block-editor/model/blockClipboard";
import { selectionRoots } from "@/services/page-actions/blockClipboardSerialize";

import type { Command, CommandContext } from "../types";

/** The block(s) a structural command targets: the selection roots, else the focused block. */
function targetBlockIds(ctx: CommandContext): string[] {
  const content = ctx.handle?.getContent() ?? [];
  if (ctx.selection.ids.length > 0) return selectionRoots(content, new Set(ctx.selection.ids)).map((block) => block.id);
  const element = ctx.activeElement?.closest<HTMLElement>("[data-block-id]");
  return element?.dataset.blockId ? [element.dataset.blockId] : [];
}

function applyHeading(level: 1 | 2 | 3): (ctx: CommandContext) => void {
  const type = `heading_${level}` as BlockType;
  return (ctx) => {
    const handle = ctx.handle;
    const targets = targetBlockIds(ctx);
    if (!handle || targets.length === 0) return;
    let tree: Block[] = handle.getContent();
    for (const id of targets) tree = changeBlockTypeInTree(tree, id, type).blocks;
    handle.updateContent(tree);
  };
}

function applyMove(direction: "up" | "down"): (ctx: CommandContext) => void {
  return (ctx) => {
    const handle = ctx.handle;
    const targets = targetBlockIds(ctx);
    if (!handle || targets.length !== 1) return; // move one block at a time
    handle.updateContent(moveBlockInTree(handle.getContent(), targets[0], direction).blocks);
  };
}

export const EDITING_COMMANDS: Command[] = [
  { id: "undo", title: "Undo", category: "Editing", run: (ctx) => ctx.handle?.undo(), enabled: (ctx) => ctx.handle?.canUndo() ?? false },
  { id: "redo", title: "Redo", category: "Editing", run: (ctx) => ctx.handle?.redo(), enabled: (ctx) => ctx.handle?.canRedo() ?? false },
  { id: "selectAll", title: "Select all blocks", category: "Selection", run: (ctx) => ctx.handle?.selectAll() },
  { id: "clearSelection", title: "Clear selection", category: "Selection", run: () => useBlockSelection.getState().clearSelection() },
  { id: "duplicate", title: "Duplicate", category: "Editing", run: (ctx) => { if (ctx.handle) duplicateSelection(ctx.handle, ctx.selection.ids); } },
  { id: "delete", title: "Delete", category: "Editing", run: (ctx) => { if (ctx.handle) deleteSelection(ctx.handle, ctx.selection.ids); } },
  { id: "moveBlockUp", title: "Move block up", category: "Editing", run: applyMove("up") },
  { id: "moveBlockDown", title: "Move block down", category: "Editing", run: applyMove("down") },
  { id: "heading1", title: "Heading 1", category: "Turn into", run: applyHeading(1) },
  { id: "heading2", title: "Heading 2", category: "Turn into", run: applyHeading(2) },
  { id: "heading3", title: "Heading 3", category: "Turn into", run: applyHeading(3) },
];
