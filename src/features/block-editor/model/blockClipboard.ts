import type { Block } from "@/entities/block";
import { removeBlocksFromTree } from "@/entities/block/model/blockTreeUtils";
import {
  lastSelectionRootId,
  parseMarkdownClipboard,
  plainTextToParagraphs,
  selectionRoots,
  serializeSelectionToClipboard,
} from "@/services/page-actions/blockClipboardSerialize";

import { cloneBlock, findBlockLocation } from "./blockContextMenu.helpers";
import type { EditorHandle } from "./editorCommandBus";
import { useBlockSelection } from "./blockSelectionStore";

/**
 * The shared block-clipboard action layer — one implementation used by BOTH the
 * right-click selection menu and the keyboard automations. Operates on the active
 * EditorHandle + the current selection ids, committing exactly ONE new tree per op.
 *
 * The lossless block payload is kept in an in-memory `lastCopied` (custom-MIME
 * clipboard writes are inconsistent across browsers); the OS clipboard still gets
 * the markdown text so an external paste works, and an internal paste is lossless.
 */
let lastCopied: { blocks: Block[]; markdown: string; text: string } | null = null;

function insertBlocksAfter(blocks: Block[], targetId: string | null, inserted: Block[]): Block[] {
  const next = blocks.map((block) => cloneBlock(block));
  if (!targetId) return [...next, ...inserted];
  const location = findBlockLocation(next, targetId);
  if (!location) return [...next, ...inserted];
  location.siblings.splice(location.index + 1, 0, ...inserted);
  return next;
}

function selectIds(handle: EditorHandle, ids: string[]): void {
  useBlockSelection.getState().select(handle.sourceKey, handle.pageId, ids);
}

function insertPasted(handle: EditorHandle, ids: readonly string[], pasted: Block[]): void {
  if (pasted.length === 0) return;
  const content = handle.getContent();
  const anchor = lastSelectionRootId(content, new Set(ids));
  handle.updateContent(insertBlocksAfter(content, anchor, pasted));
  selectIds(handle, pasted.map((block) => block.id));
}

/** Copy the given blocks (each with its subtree) from a content tree — the core
 *  shared by the selection Copy, the per-block "Copy block" menu action, and the
 *  keyboard automations. OS clipboard gets the markdown; `lastCopied` stays lossless. */
export function copyBlocks(content: Block[], ids: readonly string[]): void {
  const roots = selectionRoots(content, new Set(ids));
  if (roots.length === 0) return;
  const payload = serializeSelectionToClipboard(roots);
  lastCopied = { blocks: roots.map((block) => cloneBlock(block)), markdown: payload.markdown, text: payload.text };
  void writeClipboardText(payload.markdown);
}

export function copySelection(handle: EditorHandle, ids: readonly string[]): void {
  copyBlocks(handle.getContent(), ids);
}

/** Fresh-id clones of the internally copied blocks when `text` is that copy's
 *  markdown flavour (any page, same tab) — the lossless Ctrl+V path for the
 *  editor's paste event. Null → not an internal block paste. */
export function matchInternalCopy(text: string): Block[] | null {
  if (!lastCopied || text !== lastCopied.markdown) return null;
  return lastCopied.blocks.map((block) => cloneBlock(block, true));
}

export function deleteSelection(handle: EditorHandle, ids: readonly string[]): void {
  if (ids.length === 0) return;
  handle.updateContent(removeBlocksFromTree(handle.getContent(), new Set(ids)));
  useBlockSelection.getState().clearSelection();
}

export function cutSelection(handle: EditorHandle, ids: readonly string[]): void {
  copySelection(handle, ids);
  deleteSelection(handle, ids);
}

export function duplicateSelection(handle: EditorHandle, ids: readonly string[]): void {
  const content = handle.getContent();
  const roots = selectionRoots(content, new Set(ids));
  if (roots.length === 0) return;
  const copies = roots.map((block) => cloneBlock(block, true));
  handle.updateContent(insertBlocksAfter(content, roots[roots.length - 1].id, copies));
  selectIds(handle, copies.map((block) => block.id));
}

export async function pasteSelection(handle: EditorHandle, ids: readonly string[]): Promise<void> {
  insertPasted(handle, ids, await readClipboardBlocks());
}

export async function pastePlainSelection(handle: EditorHandle, ids: readonly string[]): Promise<void> {
  insertPasted(handle, ids, plainTextToParagraphs(await readClipboardText()));
}

async function readClipboardBlocks(): Promise<Block[]> {
  let text: string | null = null;
  try {
    if (navigator.clipboard?.readText) text = await navigator.clipboard.readText();
  } catch {
    /* read denied — fall back to the in-memory copy */
  }
  if (text === null) return lastCopied ? lastCopied.blocks.map((block) => cloneBlock(block, true)) : [];
  const internal = matchInternalCopy(text);
  if (internal) return internal;
  return text.trim() ? parseMarkdownClipboard(text) : [];
}

async function readClipboardText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    /* read denied */
  }
  return lastCopied?.text ?? "";
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable — the in-memory lastCopied still covers internal paste */
  }
}
