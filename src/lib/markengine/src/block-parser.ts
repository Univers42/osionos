/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   block-parser.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:22:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:22:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  BlockNode,
  BlockRange,
  BlockquoteNode,
  CodeBlockNode,
  DocumentNode,
  HeadingNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  ParseOptions,
  ParseResult,
  ParseDiagnostic,
  SourceSpan,
  ThematicBreakNode,
} from "./types";
import { parseInlines } from "./inline-parser";
import { splitLines, stableId } from "./utils";

const UNORDERED_LIST_RE = /^\s*[-*+]\s+/;
const ORDERED_LIST_RE = /^\s*(\d+)\.\s+/;
const TODO_LIST_RE = /^\s*[-*+]\s+\[([ xX])\]\s+/;

function span(
  startLine: number,
  endLine: number,
  startOffset: number,
  endOffset: number,
): SourceSpan {
  return { startLine, endLine, startOffset, endOffset };
}

function parseHeading(
  line: string,
): { depth: 1 | 2 | 3 | 4 | 5 | 6; content: string } | null {
  let i = 0;
  while (i < line.length && line[i] === "#") i++;
  if (i === 0 || i > 6) return null;
  if (line[i] !== " ") return null;
  return {
    depth: i as 1 | 2 | 3 | 4 | 5 | 6,
    content: line.slice(i + 1).trim(),
  };
}

function isThematicBreak(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  return /^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed);
}

function parseListMarker(line: string): {
  ordered: boolean;
  start: number;
  markerLength: number;
  checked?: boolean;
} | null {
  const todo = TODO_LIST_RE.exec(line);
  if (todo) {
    return {
      ordered: false,
      start: 1,
      markerLength: todo[0].length,
      checked: todo[1].toLowerCase() === "x",
    };
  }

  const unordered = UNORDERED_LIST_RE.exec(line);
  if (unordered) {
    return { ordered: false, start: 1, markerLength: unordered[0].length };
  }

  const ordered = ORDERED_LIST_RE.exec(line);
  if (ordered) {
    return {
      ordered: true,
      start: Number(ordered[1]),
      markerLength: ordered[0].length,
    };
  }

  return null;
}

function parseParagraph(
  lines: string[],
  startLine: number,
  endLine: number,
): ParagraphNode {
  const value = lines
    .slice(startLine, endLine + 1)
    .join(" ")
    .trim();
  return {
    id: stableId(`p:${startLine}:${endLine}:${value}`),
    kind: "paragraph",
    children: parseInlines(value, startLine),
    span: span(startLine, endLine, 0, lines[endLine].length),
  };
}

function parseCodeBlock(
  lines: string[],
  startLine: number,
): { node: CodeBlockNode; nextLine: number; diagnostics: ParseDiagnostic[] } {
  const first = lines[startLine].trim();
  const language = first.length > 3 ? first.slice(3).trim() : null;
  let cursor = startLine + 1;
  const content: string[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  while (cursor < lines.length && !lines[cursor].trim().startsWith("```")) {
    content.push(lines[cursor]);
    cursor++;
  }

  if (cursor >= lines.length) {
    diagnostics.push({
      code: "UNTERMINATED_FENCE",
      message: "Code fence is not closed before end of document.",
      severity: "warning",
      span: span(startLine, Math.max(startLine, lines.length - 1), 0, 0),
    });
  }

  const endLine = cursor < lines.length ? cursor : lines.length - 1;
  const node: CodeBlockNode = {
    id: stableId(
      `code:${startLine}:${endLine}:${language ?? ""}:${content.join("\n")}`,
    ),
    kind: "code_block",
    language,
    value: content.join("\n"),
    span: span(startLine, endLine, 0, lines[endLine]?.length ?? 0),
  };

  return {
    node,
    nextLine: cursor < lines.length ? cursor + 1 : lines.length,
    diagnostics,
  };
}

function parseBlockquote(
  lines: string[],
  startLine: number,
): { node: BlockquoteNode; nextLine: number } {
  let cursor = startLine;
  const stripped: string[] = [];

  while (cursor < lines.length && lines[cursor].trimStart().startsWith(">")) {
    stripped.push(lines[cursor].trimStart().replace(/^>\s?/, ""));
    cursor++;
  }

  const inner = parseMarkdown(stripped.join("\n")).ast.children;
  const endLine = cursor - 1;
  const node: BlockquoteNode = {
    id: stableId(`quote:${startLine}:${endLine}:${stripped.join("\n")}`),
    kind: "blockquote",
    children: inner,
    span: span(startLine, endLine, 0, lines[endLine].length),
  };

  return { node, nextLine: cursor };
}

function parseList(
  lines: string[],
  startLine: number,
): { node: ListNode; nextLine: number } {
  const firstMarker = parseListMarker(lines[startLine]);
  if (!firstMarker) {
    throw new Error("parseList called on non-list line");
  }

  let cursor = startLine;
  const items: ListItemNode[] = [];

  while (cursor < lines.length) {
    const marker = parseListMarker(lines[cursor]);
    if (marker?.ordered !== firstMarker.ordered) break;

    const itemText = lines[cursor].slice(marker.markerLength).trim();
    const paragraph = parseParagraph([itemText], 0, 0);
    const item: ListItemNode = {
      id: stableId(`li:${cursor}:${itemText}`),
      kind: "list_item",
      checked: marker.checked,
      children: [
        {
          ...paragraph,
          span: span(cursor, cursor, marker.markerLength, lines[cursor].length),
        },
      ],
      span: span(cursor, cursor, 0, lines[cursor].length),
    };
    items.push(item);
    cursor++;
  }

  const endLine = cursor - 1;
  const node: ListNode = {
    id: stableId(`list:${startLine}:${endLine}:${firstMarker.ordered}`),
    kind: "list",
    ordered: firstMarker.ordered,
    start: firstMarker.ordered ? firstMarker.start : 1,
    items,
    span: span(startLine, endLine, 0, lines[endLine].length),
  };

  return { node, nextLine: cursor };
}

interface ParsedBlock {
  node: BlockNode;
  nextLine: number;
  diagnostics: ParseDiagnostic[];
}

function indexBlock(blockIndex: BlockRange[], node: BlockNode): void {
  blockIndex.push({
    id: node.id,
    startLine: node.span.startLine,
    endLine: node.span.endLine,
  });
}

function parseParagraphRange(lines: string[], cursor: number): number {
  let paraEnd = cursor;
  while (paraEnd + 1 < lines.length) {
    const candidate = lines[paraEnd + 1].trim();
    if (candidate.length === 0) break;
    if (candidate.startsWith("```")) break;
    if (lines[paraEnd + 1].trimStart().startsWith(">")) break;
    if (parseHeading(candidate)) break;
    if (parseListMarker(lines[paraEnd + 1])) break;
    if (isThematicBreak(candidate)) break;
    paraEnd++;
  }
  return paraEnd;
}

function parseBlockAt(lines: string[], cursor: number): ParsedBlock | null {
  const line = lines[cursor];
  const trimmed = line.trim();

  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("```")) {
    const { node, nextLine, diagnostics } = parseCodeBlock(lines, cursor);
    return { node, nextLine, diagnostics };
  }

  if (line.trimStart().startsWith(">")) {
    const { node, nextLine } = parseBlockquote(lines, cursor);
    return { node, nextLine, diagnostics: [] };
  }

  const heading = parseHeading(trimmed);
  if (heading) {
    const node: HeadingNode = {
      id: stableId(`h:${cursor}:${heading.depth}:${heading.content}`),
      kind: "heading",
      depth: heading.depth,
      children: parseInlines(heading.content, cursor),
      span: span(cursor, cursor, 0, line.length),
    };
    return { node, nextLine: cursor + 1, diagnostics: [] };
  }

  if (isThematicBreak(line)) {
    const node: ThematicBreakNode = {
      id: stableId(`hr:${cursor}:${trimmed}`),
      kind: "thematic_break",
      span: span(cursor, cursor, 0, line.length),
    };
    return { node, nextLine: cursor + 1, diagnostics: [] };
  }

  if (parseListMarker(line)) {
    const { node, nextLine } = parseList(lines, cursor);
    return { node, nextLine, diagnostics: [] };
  }

  const paraEnd = parseParagraphRange(lines, cursor);
  const paragraph = parseParagraph(lines, cursor, paraEnd);
  return { node: paragraph, nextLine: paraEnd + 1, diagnostics: [] };
}

export function parseMarkdown(
  input: string,
  options: ParseOptions = {},
): ParseResult {
  const lines = splitLines(input);
  const children: BlockNode[] = [];
  const blockIndex: BlockRange[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  let cursor = 0;
  while (cursor < lines.length) {
    const parsed = parseBlockAt(lines, cursor);
    if (!parsed) {
      cursor++;
      continue;
    }
    children.push(parsed.node);
    diagnostics.push(...parsed.diagnostics);
    indexBlock(blockIndex, parsed.node);
    cursor = parsed.nextLine;
  }

  const doc: DocumentNode = {
    id: stableId(`doc:${input.length}:${options.documentVersion ?? 0}`),
    kind: "document",
    version: options.documentVersion ?? 0,
    children,
    span: span(0, Math.max(0, lines.length - 1), 0, lines.at(-1)?.length ?? 0),
  };

  return { ast: doc, blockIndex, diagnostics };
}
