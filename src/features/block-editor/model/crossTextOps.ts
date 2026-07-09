/**
 * Pure operations for cross-block text selection: slicing a block's inline
 * source by plain-text offsets (keeping formatting), serializing the covered
 * range to clipboard flavors, and collapsing the range for delete/typing.
 * All offsets are PLAIN-TEXT offsets — the same currency the inline editor
 * uses everywhere (`applyInlineFormatting`, selection snapshots).
 */

import type { Block } from "@/entities/block/model/types";
import { findBlockInTree } from "@/entities/block/model/blockTreeUtils";
// Deep imports (not the markengine barrel): the barrel drags in .tsx renderers,
// which the node --test strip-types runner cannot load.
import { parseInline } from "@/shared/lib/markengine/markdown/parserInline";
import { parse } from "@/shared/lib/markengine/markdown/parser";
import { renderHtml } from "@/shared/lib/markengine/markdown/renderers/html";
import {
  getInlineNodesTextLength,
  serializeInlineNodes,
  splitNodesAtOffset,
} from "@/shared/lib/markengine/inlineAst";
import type { InlineNode } from "@/shared/lib/markengine/markdown/ast";

export interface CrossTextPoint {
  blockId: string;
  /** Plain-text offset within the block's rendered text. */
  offset: number;
}

/** Document-ordered range: `start` is above `end`; middles sit between them. */
export interface CrossTextRange {
  start: CrossTextPoint;
  end: CrossTextPoint;
  /** Every block between start and end in document order (leaves included). */
  middleIds: string[];
}

/** Slice inline source by plain-text offsets, preserving formatting tokens. */
export function sliceInlineSource(source: string, from: number, to?: number): string {
  const nodes = parseInline(source);
  const total = getInlineNodesTextLength(nodes);
  const clampedFrom = Math.max(0, Math.min(from, total));
  const clampedTo = Math.max(clampedFrom, Math.min(to ?? total, total));
  const [, tail] = splitNodesAtOffset(nodes, clampedFrom);
  const [middle] = splitNodesAtOffset(tail, clampedTo - clampedFrom);
  return serializeInlineNodes(middle);
}

/** Plain text (markup stripped) of an inline source string. */
export function plainTextOfInlineSource(source: string): string {
  const walk = (nodes: InlineNode[]): string =>
    nodes
      .map((node) => {
        if ("children" in node && Array.isArray(node.children)) return walk(node.children);
        if ("value" in node && typeof node.value === "string") return node.value;
        return "";
      })
      .join("");
  return walk(parseInline(source));
}

const MARKDOWN_PREFIX: Partial<Record<Block["type"], string>> = {
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### ",
  heading_4: "#### ",
  heading_5: "##### ",
  heading_6: "###### ",
  bulleted_list: "- ",
  numbered_list: "1. ",
  to_do: "- [ ] ",
  quote: "> ",
};

export interface CrossTextSegment {
  type: Block["type"];
  /** Inline source slice (formatting preserved). */
  source: string;
}

/** The covered content as ordered segments: partial start, whole middles, partial end. */
export function crossTextSegments(blocks: Block[], range: CrossTextRange): CrossTextSegment[] {
  const startBlock = findBlockInTree(blocks, range.start.blockId);
  const endBlock = findBlockInTree(blocks, range.end.blockId);
  if (!startBlock || !endBlock) return [];
  if (range.start.blockId === range.end.blockId) {
    return [{ type: startBlock.type, source: sliceInlineSource(startBlock.content ?? "", range.start.offset, range.end.offset) }];
  }
  const middles = range.middleIds
    .map((id) => findBlockInTree(blocks, id))
    .filter((block): block is Block => Boolean(block))
    .map((block) => ({ type: block.type, source: block.content ?? "" }));
  return [
    { type: startBlock.type, source: sliceInlineSource(startBlock.content ?? "", range.start.offset) },
    ...middles,
    { type: endBlock.type, source: sliceInlineSource(endBlock.content ?? "", 0, range.end.offset) },
  ];
}

export interface CrossTextClipboardPayload {
  /** Lossless internal flavor (application/x-osionos-blocks). */
  json: string;
  /** Canonical-source markdown — the internal text/markdown paste flavor. */
  markdown: string;
  /** Rendered HTML (text/html) — formatted paste into external apps. */
  html: string;
  /** Markup-stripped plain text (text/plain — the paste-without-format flavor). */
  plain: string;
}

/** Builds all clipboard flavors from the covered segments. */
export function serializeCrossText(blocks: Block[], range: CrossTextRange): CrossTextClipboardPayload {
  const segments = crossTextSegments(blocks, range);
  const markdown = segments
    .map((segment) => `${MARKDOWN_PREFIX[segment.type] ?? ""}${segment.source}`)
    .join("\n\n");
  const plain = segments.map((segment) => plainTextOfInlineSource(segment.source)).join("\n");
  return {
    json: JSON.stringify({ version: 1, segments }),
    markdown,
    html: renderHtml(parse(markdown)),
    plain,
  };
}

export interface CrossTextCollapseResult {
  blocks: Block[];
  caretBlockId: string;
  /** Plain-text caret offset in the merged block. */
  caretOffset: number;
}

/** Removes blocks, promoting their UNCOVERED children into the removed slot —
 *  a cross-selection must never delete content beyond what was covered. */
function removeWithPromotion(blocks: Block[], removeIds: Set<string>): Block[] {
  const walk = (list: Block[]): Block[] =>
    list.flatMap((entry) => {
      const kids = entry.children?.length ? walk(entry.children) : [];
      if (removeIds.has(entry.id)) return kids;
      return [entry.children ? { ...entry, children: kids } : entry];
    });
  return walk(blocks);
}

/**
 * Deletes the covered range and merges the end block's tail into the start
 * block (optionally inserting typed text at the seam). Covered middle blocks
 * are removed; uncovered children of any removed block promote into its slot —
 * never deleted beyond what was selected.
 */
export function collapseCrossText(
  blocks: Block[],
  range: CrossTextRange,
  insertText = "",
): CrossTextCollapseResult | null {
  const startBlock = findBlockInTree(blocks, range.start.blockId);
  const endBlock = findBlockInTree(blocks, range.end.blockId);
  if (!startBlock || !endBlock) return null;

  const sameBlock = range.start.blockId === range.end.blockId;
  const head = sliceInlineSource(startBlock.content ?? "", 0, range.start.offset);
  const tail = sameBlock
    ? sliceInlineSource(startBlock.content ?? "", range.end.offset)
    : sliceInlineSource(endBlock.content ?? "", range.end.offset);
  const merged = head + insertText + tail;

  const removeIds = new Set(sameBlock ? [] : [...range.middleIds, range.end.blockId]);
  const withoutCovered = removeIds.size > 0 ? removeWithPromotion(blocks, removeIds) : blocks;

  const patch = (list: Block[]): Block[] =>
    list.map((block) => {
      if (block.id === range.start.blockId) return { ...block, content: merged };
      if (block.children?.length) return { ...block, children: patch(block.children) };
      return block;
    });

  return {
    blocks: patch(withoutCovered),
    caretBlockId: range.start.blockId,
    caretOffset: plainTextOfInlineSource(head).length + insertText.length,
  };
}
