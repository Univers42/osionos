import { IncrementalParseResult, IncrementalPatch, ParseResult } from "./types";
import { parseMarkdown } from "./block-parser";
import { splitLines } from "./utils";

function applyPatchToText(text: string, patch: IncrementalPatch): string {
  const lines = splitLines(text);
  const replacement = splitLines(patch.text);
  const before = lines.slice(0, patch.fromLine);
  const after = lines.slice(patch.toLine + 1);
  return [...before, ...replacement, ...after].join("\n");
}

function changedIds(prev: ParseResult, next: ParseResult): string[] {
  const prevSet = new Set(
    prev.blockIndex.map((r) => `${r.startLine}:${r.endLine}:${r.id}`),
  );
  const diff: string[] = [];
  for (const range of next.blockIndex) {
    const key = `${range.startLine}:${range.endLine}:${range.id}`;
    if (!prevSet.has(key)) diff.push(range.id);
  }
  return diff;
}

export function incrementalParse(
  previousText: string,
  previousResult: ParseResult,
  patch: IncrementalPatch,
): IncrementalParseResult {
  const nextText = applyPatchToText(previousText, patch);
  const nextResult = parseMarkdown(nextText, {
    documentVersion: previousResult.ast.version + 1,
  });

  return {
    text: nextText,
    ast: nextResult.ast,
    changedNodeIds: changedIds(previousResult, nextResult),
  };
}
