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
  SourceSpan,
  ThematicBreakNode,
} from "./types";
import { parseInlines } from "./inline-parser";
import { splitLines, stableId } from "./utils";

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

function parseListMarker(
  line: string,
): {
  ordered: boolean;
  start: number;
  markerLength: number;
  checked?: boolean;
} | null {
  const unordered = line.match(/^\s*[-*+]\s+/);
  if (unordered) {
    return { ordered: false, start: 1, markerLength: unordered[0].length };
  }

  const ordered = line.match(/^\s*(\d+)\.\s+/);
  if (ordered) {
    return {
      ordered: true,
      start: Number(ordered[1]),
      markerLength: ordered[0].length,
    };
  }

  const todo = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+/);
  if (todo) {
    return {
      ordered: false,
      start: 1,
      markerLength: todo[0].length,
      checked: todo[1].toLowerCase() === "x",
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
): { node: CodeBlockNode; nextLine: number } {
  const first = lines[startLine].trim();
  const language = first.length > 3 ? first.slice(3).trim() : null;
  let cursor = startLine + 1;
  const content: string[] = [];

  while (cursor < lines.length && !lines[cursor].trim().startsWith("```")) {
    content.push(lines[cursor]);
    cursor++;
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
    if (!marker || marker.ordered !== firstMarker.ordered) break;

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

export function parseMarkdown(
  input: string,
  options: ParseOptions = {},
): ParseResult {
  const lines = splitLines(input);
  const children: BlockNode[] = [];
  const blockIndex: BlockRange[] = [];

  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      cursor++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const { node, nextLine } = parseCodeBlock(lines, cursor);
      children.push(node);
      blockIndex.push({
        id: node.id,
        startLine: node.span.startLine,
        endLine: node.span.endLine,
      });
      cursor = nextLine;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const { node, nextLine } = parseBlockquote(lines, cursor);
      children.push(node);
      blockIndex.push({
        id: node.id,
        startLine: node.span.startLine,
        endLine: node.span.endLine,
      });
      cursor = nextLine;
      continue;
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
      children.push(node);
      blockIndex.push({ id: node.id, startLine: cursor, endLine: cursor });
      cursor++;
      continue;
    }

    if (isThematicBreak(line)) {
      const node: ThematicBreakNode = {
        id: stableId(`hr:${cursor}:${trimmed}`),
        kind: "thematic_break",
        span: span(cursor, cursor, 0, line.length),
      };
      children.push(node);
      blockIndex.push({ id: node.id, startLine: cursor, endLine: cursor });
      cursor++;
      continue;
    }

    const marker = parseListMarker(line);
    if (marker) {
      const { node, nextLine } = parseList(lines, cursor);
      children.push(node);
      blockIndex.push({
        id: node.id,
        startLine: node.span.startLine,
        endLine: node.span.endLine,
      });
      cursor = nextLine;
      continue;
    }

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

    const paragraph = parseParagraph(lines, cursor, paraEnd);
    children.push(paragraph);
    blockIndex.push({
      id: paragraph.id,
      startLine: paragraph.span.startLine,
      endLine: paragraph.span.endLine,
    });
    cursor = paraEnd + 1;
  }

  const doc: DocumentNode = {
    id: stableId(`doc:${input.length}:${options.documentVersion ?? 0}`),
    kind: "document",
    version: options.documentVersion ?? 0,
    children,
    span: span(
      0,
      Math.max(0, lines.length - 1),
      0,
      lines[lines.length - 1]?.length ?? 0,
    ),
  };

  return { ast: doc, blockIndex };
}
