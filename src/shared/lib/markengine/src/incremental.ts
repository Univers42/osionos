/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   incremental.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:27:44 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 21:15:28 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  BlockNode,
  BlockRange,
  DocumentNode,
  IncrementalParseResult,
  IncrementalPatch,
  ParseDiagnostic,
  ParseResult,
} from "./types";
import { indexBlock, parseBlockAtLine, parseMarkdown } from "./block-parser";
import { splitLines, stableId } from "./utils";

interface NormalizedPatch {
  fromLine: number;
  toLine: number;
  text: string;
}

interface CachedBlock {
  key: string;
  node: BlockNode;
  nextLine: number;
}

interface ParsedRange {
  nodes: BlockNode[];
  blockIndex: BlockRange[];
  diagnostics: ParseDiagnostic[];
}

const STRUCTURAL_DELIMITER_RE = /```|\$\$|---/;

function normalizePatch(
  patch: IncrementalPatch,
  maxLine: number,
): { patch: NormalizedPatch; diagnostics: ParseDiagnostic[] } {
  const diagnostics: ParseDiagnostic[] = [];
  let fromLine = patch.fromLine;
  let toLine = patch.toLine;

  if (fromLine > toLine) {
    diagnostics.push({
      code: "PATCH_RANGE_SWAPPED",
      message:
        "Patch fromLine was greater than toLine and has been normalized.",
      severity: "warning",
      span: {
        startLine: Math.max(0, Math.min(fromLine, maxLine)),
        endLine: Math.max(0, Math.min(toLine, maxLine)),
        startOffset: 0,
        endOffset: 0,
      },
    });
    [fromLine, toLine] = [toLine, fromLine];
  }

  const boundedFrom = Math.max(0, Math.min(fromLine, maxLine));
  const boundedTo = Math.max(0, Math.min(toLine, maxLine));

  if (boundedFrom !== patch.fromLine || boundedTo !== patch.toLine) {
    diagnostics.push({
      code: "PATCH_RANGE_CLAMPED",
      message:
        "Patch range was out of bounds and has been clamped to the document.",
      severity: "warning",
      span: {
        startLine: boundedFrom,
        endLine: boundedTo,
        startOffset: 0,
        endOffset: 0,
      },
    });
  }

  return {
    patch: {
      fromLine: boundedFrom,
      toLine: boundedTo,
      text: patch.text,
    },
    diagnostics,
  };
}

function applyPatchToText(text: string, patch: IncrementalPatch): string {
  const lines = splitLines(text);
  const { patch: normalized } = normalizePatch(
    patch,
    Math.max(0, lines.length - 1),
  );
  const replacement = splitLines(normalized.text);
  const before = lines.slice(0, normalized.fromLine);
  const after = lines.slice(normalized.toLine + 1);
  return [...before, ...replacement, ...after].join("\n");
}

function changedIds(prev: ParseResult, next: ParseResult): string[] {
  const prevSet = new Set(prev.blockIndex.map((range) => range.id));
  const diff: string[] = [];
  for (const range of next.blockIndex) {
    if (!prevSet.has(range.id)) diff.push(range.id);
  }
  return diff;
}

function changedIdsForSplice(
  removedBlocks: BlockRange[],
  insertedBlocks: BlockRange[],
): string[] {
  const removedIds = new Set(removedBlocks.map((range) => range.id));
  return insertedBlocks
    .filter((range) => !removedIds.has(range.id))
    .map((range) => range.id);
}

function blockCacheKey(lines: string[], startLine: number, endLine: number): string {
  return `${startLine}:${stableId(lines.slice(startLine, endLine + 1).join("\n"))}`;
}

function buildBlockCache(
  lines: string[],
  blocks: BlockNode[],
  startIndex = 0,
  endIndex = blocks.length,
): Map<number, CachedBlock> {
  const cache = new Map<number, CachedBlock>();
  for (let index = startIndex; index < endIndex; index++) {
    const node = blocks[index];
    cache.set(node.span.startLine, {
      key: blockCacheKey(lines, node.span.startLine, node.span.endLine),
      node,
      nextLine: node.span.endLine + 1,
    });
  }
  return cache;
}

function isBlankLine(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

function isHeadingStart(line: string | undefined): boolean {
  return /^#{1,6}\s/.test(line?.trim() ?? "");
}

function isFenceBoundary(line: string | undefined): boolean {
  return (line?.trim() ?? "").startsWith("```");
}

function isBlockquoteLine(line: string | undefined): boolean {
  return (line ?? "").trimStart().startsWith(">");
}

function isListLine(line: string | undefined): boolean {
  return /^\s*[-*+]\s+/.test(line ?? "") || /^\s*\d+\.\s+/.test(line ?? "");
}

function isThematicBreakLine(line: string | undefined): boolean {
  const trimmed = (line ?? "").trim();
  return trimmed.length >= 3 && (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed));
}

function canContinueParagraph(line: string | undefined): boolean {
  if (isBlankLine(line)) return false;
  if (isFenceBoundary(line)) return false;
  if (isBlockquoteLine(line)) return false;
  if (isHeadingStart(line)) return false;
  if (isListLine(line)) return false;
  if (isThematicBreakLine(line)) return false;
  return true;
}

function canReuseCachedBlock(
  lines: string[],
  cached: CachedBlock,
  endLine: number,
): boolean {
  if (cached.node.span.endLine > endLine) return false;
  const nextLine = lines[cached.node.span.endLine + 1];
  if (cached.node.kind === "paragraph") return !canContinueParagraph(nextLine);
  if (cached.node.kind === "blockquote") return !isBlockquoteLine(nextLine);
  if (cached.node.kind === "list") return !isListLine(nextLine);
  return true;
}

function findStableBoundaryAbove(lines: string[], line: number): number {
  if (lines.length === 0) return 0;
  let cursor = Math.max(0, Math.min(line, lines.length - 1));
  if (isBlankLine(lines[cursor]) && cursor > 0) cursor--;

  while (cursor > 0) {
    if (isBlankLine(lines[cursor - 1])) return cursor;
    if (isHeadingStart(lines[cursor]) || isFenceBoundary(lines[cursor])) {
      return cursor;
    }
    cursor--;
  }
  return 0;
}

function findStableBoundaryBelow(lines: string[], line: number): number {
  if (lines.length === 0) return 0;
  let cursor = Math.max(0, Math.min(line, lines.length - 1));
  if (isBlankLine(lines[cursor]) && cursor + 1 < lines.length) cursor++;

  while (cursor + 1 < lines.length) {
    const nextLine = lines[cursor + 1];
    if (isBlankLine(nextLine)) return cursor;
    if (isHeadingStart(nextLine) || isFenceBoundary(nextLine)) return cursor;
    cursor++;
  }
  return lines.length - 1;
}

function findRemovalBoundaryBelow(lines: string[], line: number): number {
  const boundedLine = Math.max(0, Math.min(line, lines.length - 1));
  if (isBlankLine(lines[boundedLine])) return Math.max(0, boundedLine - 1);
  return findStableBoundaryBelow(lines, boundedLine);
}

function firstBlockEndingAtOrAfter(
  blockIndex: BlockRange[],
  line: number,
): number {
  let low = 0;
  let high = blockIndex.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (blockIndex[middle].endLine < line) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstBlockStartingAfter(blockIndex: BlockRange[], line: number): number {
  let low = 0;
  let high = blockIndex.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (blockIndex[middle].startLine <= line) low = middle + 1;
    else high = middle;
  }
  return low;
}

function intersectingBlockBounds(
  blockIndex: BlockRange[],
  fromLine: number,
  toLine: number,
): { start: number; end: number } {
  const start = firstBlockEndingAtOrAfter(blockIndex, fromLine);
  let end = start;
  while (end < blockIndex.length && blockIndex[end].startLine <= toLine) {
    end++;
  }
  return { start, end };
}

function patchTouchesUnterminatedFence(
  previousResult: ParseResult,
  patch: NormalizedPatch,
): boolean {
  return previousResult.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "UNTERMINATED_FENCE" &&
      patch.toLine >= diagnostic.span.startLine,
  );
}

function shouldFullReparse(
  previousResult: ParseResult,
  patch: NormalizedPatch,
): boolean {
  return (
    STRUCTURAL_DELIMITER_RE.test(patch.text) ||
    patchTouchesUnterminatedFence(previousResult, patch)
  );
}

function parseRangeWithCache(
  lines: string[],
  startLine: number,
  endLine: number,
  cache: Map<number, CachedBlock>,
): ParsedRange | null {
  const nodes: BlockNode[] = [];
  const blockIndex: BlockRange[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  let cursor = startLine;

  while (cursor <= endLine && cursor < lines.length) {
    const cached = cache.get(cursor);
    if (cached) {
      const key = blockCacheKey(lines, cursor, cached.node.span.endLine);
      if (cached.key === key && canReuseCachedBlock(lines, cached, endLine)) {
        nodes.push(cached.node);
        indexBlock(blockIndex, cached.node);
        cursor = cached.nextLine;
        continue;
      }
    }

    const parsed = parseBlockAtLine(lines, cursor);
    if (!parsed) {
      cursor++;
      continue;
    }
    if (parsed.node.span.endLine > endLine) return null;
    nodes.push(parsed.node);
    diagnostics.push(...parsed.diagnostics);
    indexBlock(blockIndex, parsed.node);
    cursor = parsed.nextLine;
  }

  return { nodes, blockIndex, diagnostics };
}

function reparseShiftedBlocks(
  lines: string[],
  blockIndex: BlockRange[],
  lineDelta: number,
): ParsedRange | null {
  const nodes: BlockNode[] = [];
  const shiftedIndex: BlockRange[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  for (const range of blockIndex) {
    const shiftedStart = range.startLine + lineDelta;
    const parsed = parseBlockAtLine(lines, shiftedStart);
    if (!parsed) return null;
    nodes.push(parsed.node);
    diagnostics.push(...parsed.diagnostics);
    indexBlock(shiftedIndex, parsed.node);
  }

  return { nodes, blockIndex: shiftedIndex, diagnostics };
}

function createDocument(
  text: string,
  lines: string[],
  children: BlockNode[],
  version: number,
): DocumentNode {
  return {
    id: stableId(`doc:${text.length}:${version}`),
    kind: "document",
    version,
    children,
    span: {
      startLine: 0,
      endLine: Math.max(0, lines.length - 1),
      startOffset: 0,
      endOffset: lines.at(-1)?.length ?? 0,
    },
  };
}

function fullIncrementalParse(
  previousResult: ParseResult,
  nextText: string,
  diagnostics: ParseDiagnostic[],
): IncrementalParseResult {
  const nextResult = parseMarkdown(nextText, {
    documentVersion: previousResult.ast.version + 1,
  });
  return {
    text: nextText,
    ast: nextResult.ast,
    blockIndex: nextResult.blockIndex,
    changedNodeIds: changedIds(previousResult, nextResult),
    diagnostics: [...diagnostics, ...nextResult.diagnostics],
  };
}

export function incrementalParse(
  previousText: string,
  previousResult: ParseResult,
  patch: IncrementalPatch,
): IncrementalParseResult {
  const previousLines = splitLines(previousText);
  const { patch: normalizedPatch, diagnostics: incrementalDiagnostics } =
    normalizePatch(patch, Math.max(0, previousLines.length - 1));
  const nextText = applyPatchToText(previousText, normalizedPatch);
  const nextLines = splitLines(nextText);

  if (shouldFullReparse(previousResult, normalizedPatch)) {
    return fullIncrementalParse(
      previousResult,
      nextText,
      incrementalDiagnostics,
    );
  }

  const replacementLineCount = splitLines(normalizedPatch.text).length;
  const replacedLineCount = normalizedPatch.toLine - normalizedPatch.fromLine + 1;
  const lineDelta = replacementLineCount - replacedLineCount;
  const intersecting = intersectingBlockBounds(
    previousResult.blockIndex,
    normalizedPatch.fromLine,
    normalizedPatch.toLine,
  );
  const oldSeedStart = Math.min(
    previousResult.blockIndex[intersecting.start]?.startLine ??
      normalizedPatch.fromLine,
    normalizedPatch.fromLine,
  );
  const oldSeedEnd =
    previousResult.blockIndex[intersecting.end - 1]?.endLine ??
    normalizedPatch.toLine;
  const oldStart = findStableBoundaryAbove(previousLines, oldSeedStart);
  const newPatchEnd = normalizedPatch.fromLine + replacementLineCount - 1;
  const newSeedEnd = Math.max(0, Math.min(newPatchEnd, nextLines.length - 1));
  const newStart = findStableBoundaryAbove(nextLines, oldStart);
  const newEnd = findStableBoundaryBelow(nextLines, newSeedEnd);
  const oldEndSeed = Math.max(oldSeedEnd, newEnd - lineDelta);
  const oldEndForRemoval = findRemovalBoundaryBelow(previousLines, oldEndSeed);

  const beforeEndIndex = firstBlockEndingAtOrAfter(
    previousResult.blockIndex,
    newStart,
  );
  const afterStartIndex = firstBlockStartingAfter(
    previousResult.blockIndex,
    oldEndForRemoval,
  );
  const beforeIndex = previousResult.blockIndex.slice(0, beforeEndIndex);
  const removedIndex = previousResult.blockIndex.slice(
    beforeEndIndex,
    afterStartIndex,
  );
  const afterIndex = previousResult.blockIndex.slice(afterStartIndex);
  const beforeNodes = previousResult.ast.children.slice(0, beforeIndex.length);
  const previousAfterNodes = previousResult.ast.children.slice(afterStartIndex);
  const cache = buildBlockCache(
    previousLines,
    previousResult.ast.children,
    beforeEndIndex,
    afterStartIndex,
  );
  const parsedRange = parseRangeWithCache(nextLines, newStart, newEnd, cache);

  if (!parsedRange) {
    return fullIncrementalParse(
      previousResult,
      nextText,
      incrementalDiagnostics,
    );
  }

  const afterRange =
    lineDelta === 0
      ? {
          nodes: previousAfterNodes,
          blockIndex: afterIndex,
          diagnostics: [],
        }
      : reparseShiftedBlocks(nextLines, afterIndex, lineDelta);

  if (!afterRange) {
    return fullIncrementalParse(
      previousResult,
      nextText,
      incrementalDiagnostics,
    );
  }

  const children = [...beforeNodes, ...parsedRange.nodes, ...afterRange.nodes];
  const blockIndex = [
    ...beforeIndex,
    ...parsedRange.blockIndex,
    ...afterRange.blockIndex,
  ];
  const ast = createDocument(
    nextText,
    nextLines,
    children,
    previousResult.ast.version + 1,
  );

  return {
    text: nextText,
    ast,
    blockIndex,
    changedNodeIds: changedIdsForSplice(removedIndex, parsedRange.blockIndex),
    diagnostics: [
      ...incrementalDiagnostics,
      ...parsedRange.diagnostics,
      ...afterRange.diagnostics,
    ],
  };
}
