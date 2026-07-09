import type { Block } from "@/entities/block";
// Narrow import (the parser only) — the markengine barrel also pulls the JSX React
// renderers, which we don't need here and which the node test loader can't strip.
import { parseMarkdownToBlocks } from "@/shared/lib/markengine/markdown/shortcuts";
import { serializeBlocksToMarkdown } from "./pageMarkdownSerialize";

/** Lossless internal block payload MIME (for a future cross-tab clipboard write). */
export const OSIONOS_BLOCKS_MIME = "application/x-osionos-blocks+json";

export interface ClipboardPayload {
  text: string;
  markdown: string;
  json: string;
}

/** Deep-clone a block subtree with fresh ids (paste must never collide with the source). */
function regenerateIds(block: Block): Block {
  return { ...block, id: crypto.randomUUID(), children: block.children?.map(regenerateIds) };
}

/** Flatten a block subtree to text, one line per block (the plain-text flavour). */
function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const child = block.children?.length ? "\n" + blocksToPlainText(block.children) : "";
      return (block.content ?? "") + child;
    })
    .join("\n");
}

/**
 * The top-most selected blocks in document order — a selected block whose ancestor
 * chain has no selected block above it. Each carries its whole subtree, so a selected
 * parent is copied/cut once (its children ride along) instead of N times.
 */
export function selectionRoots(blocks: Block[], idSet: Set<string>, ancestorSelected = false): Block[] {
  const roots: Block[] = [];
  for (const block of blocks) {
    const selected = idSet.has(block.id);
    if (selected && !ancestorSelected) roots.push(block);
    if (block.children?.length) roots.push(...selectionRoots(block.children, idSet, ancestorSelected || selected));
  }
  return roots;
}

/** The last selection root's id (the paste/duplicate anchor), or null if nothing selected. */
export function lastSelectionRootId(blocks: Block[], idSet: Set<string>): string | null {
  const roots = selectionRoots(blocks, idSet);
  return roots.length ? roots[roots.length - 1].id : null;
}

export function serializeSelectionToClipboard(blocks: Block[]): ClipboardPayload {
  return {
    text: blocksToPlainText(blocks),
    markdown: serializeBlocksToMarkdown(blocks),
    json: JSON.stringify({ v: 1, kind: "osionos-blocks", blocks }),
  };
}

/** Parse a JSON block payload (lossless, ids regenerated). Returns null if not our shape. */
export function parseBlocksJson(json: string | null): Block[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { kind?: string; blocks?: unknown };
    if (parsed.kind !== "osionos-blocks" || !Array.isArray(parsed.blocks)) return null;
    return (parsed.blocks as Block[]).map(regenerateIds);
  } catch {
    return null;
  }
}

/** Markdown → blocks (the formatted-paste path; `# x` becomes a heading). */
export function parseMarkdownClipboard(markdown: string): Block[] {
  return parseMarkdownToBlocks(markdown);
}

/**
 * Arbitrary plain text → paragraph blocks, split on blank lines. "Paste without
 * formatting": no markdown parsing, so `# x` / `- y` stay literal text.
 */
export function plainTextToParagraphs(text: string): Block[] {
  const chunks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const source = chunks.length ? chunks : [""];
  return source.map((content) => ({ id: crypto.randomUUID(), type: "paragraph", content }));
}
