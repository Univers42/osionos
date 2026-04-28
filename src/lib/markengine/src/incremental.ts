/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   incremental.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:22:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:22:15 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  IncrementalParseResult,
  IncrementalPatch,
  ParseDiagnostic,
  ParseResult,
} from "./types";
import { parseMarkdown } from "./block-parser";
import { splitLines } from "./utils";

interface NormalizedPatch {
  fromLine: number;
  toLine: number;
  text: string;
}

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
  const previousLines = splitLines(previousText);
  const { patch: normalizedPatch, diagnostics: incrementalDiagnostics } =
    normalizePatch(patch, Math.max(0, previousLines.length - 1));
  const nextText = applyPatchToText(previousText, normalizedPatch);
  const nextResult = parseMarkdown(nextText, {
    documentVersion: previousResult.ast.version + 1,
  });

  return {
    text: nextText,
    ast: nextResult.ast,
    changedNodeIds: changedIds(previousResult, nextResult),
    diagnostics: [...incrementalDiagnostics, ...nextResult.diagnostics],
  };
}
