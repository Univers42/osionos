// Markdown Parser — full CommonMark + GFM parser, zero dependencies

import type { BlockNode } from "./ast";
import { parseInline, slugify } from "./parserInline";
import type { ParseContext } from "./parserBlockHelpers";
import {
  peek,
  advance,
  isThematicBreak,
  isSetextHeading,
  parseFencedCode,
  parseMathBlock,
  isHtmlBlockTag,
  parseHtmlBlock,
  isTableStart,
  parseTable,
  parseIndentedCode,
  parseParagraph,
} from "./parserBlockHelpers";
import {
  parseBlockquote,
  parseCallout,
  parseTaskList,
  parseUnorderedList,
  parseOrderedList,
  parseFootnoteDef,
  parseToggle,
} from "./parserBlockNested";

export { parseInline } from "./parserInline";

export function parse(markdown: string): BlockNode[] {
  const lines = markdown.split("\n");
  const ctx: ParseContext = { lines, pos: 0 };
  return parseBlocks(ctx, 0);
}

function tryParseHeading(ctx: ParseContext, trimmed: string): BlockNode | null {
  const hm = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(trimmed);
  if (!hm) return null;
  advance(ctx);
  const level = hm[1].length as 1 | 2 | 3 | 4 | 5 | 6;
  return {
    type: "heading",
    level,
    children: parseInline(hm[2]),
    id: slugify(hm[2]),
  };
}

function tryParseSetextHeading(ctx: ParseContext): BlockNode | null {
  if (!isSetextHeading(ctx)) return null;
  const textLine = advance(ctx);
  const ml = advance(ctx);
  const lv = ml.trim().startsWith("=") ? 1 : 2;
  return {
    type: "heading",
    level: lv,
    children: parseInline(textLine.trim()),
    id: slugify(textLine.trim()),
  };
}

type ParseBlocksFn = (ctx: ParseContext, indent: number) => BlockNode[];

/** Try to parse a primary (non-nested) block from the current line. */
function tryParsePrimaryBlock(
  ctx: ParseContext,
  trimmed: string,
): BlockNode | null {
  if (trimmed.startsWith("```") || trimmed.startsWith("~~~"))
    return parseFencedCode(ctx);
  if (trimmed.startsWith("$$")) return parseMathBlock(ctx);
  if (
    /^<([a-zA-Z][a-zA-Z0-9-]*)[\s>/]/.test(trimmed) &&
    isHtmlBlockTag(trimmed)
  )
    return parseHtmlBlock(ctx);
  if (isTableStart(ctx)) return parseTable(ctx);
  return null;
}

/** Try to parse a nested/list-type block from the current line. */
function tryParseNestedBlock(
  ctx: ParseContext,
  trimmed: string,
  lineIndent: number,
  indent: number,
  parseFn: ParseBlocksFn,
): BlockNode | null {
  if (/^>\s*(?:\[\s*>\s*\]|\[toggle\])\s*/i.test(trimmed))
    return parseToggle(ctx, parseFn);
  if (/^>\s*\[!(\w+)\]/.test(trimmed)) return parseCallout(ctx, parseFn);
  if (trimmed.startsWith("> ") || trimmed === ">")
    return parseBlockquote(ctx, parseFn);
  if (/^[-*+]\s+\[([ xX])\]\s/.test(trimmed))
    return parseTaskList(ctx, parseFn);
  if (/^[-*+]\s+/.test(trimmed) && !isThematicBreak(trimmed))
    return parseUnorderedList(ctx, parseFn);
  if (/^\d{1,9}[.)]\s+/.test(trimmed)) return parseOrderedList(ctx, parseFn);
  if (/^\[\^([^\]]+)\]:\s/.test(trimmed)) return parseFootnoteDef(ctx, parseFn);
  if (lineIndent >= 4 && indent === 0) return parseIndentedCode(ctx);
  return null;
}

/** Parse a single block node from the current position. */
function parseNextBlock(ctx: ParseContext, indent: number): BlockNode | null {
  const line = peek(ctx) ?? "";
  const trimmed = line.trimStart();
  const lineIndent = line.length - trimmed.length;

  if (trimmed === "") {
    advance(ctx);
    return null;
  }
  if (isThematicBreak(trimmed)) {
    advance(ctx);
    return { type: "thematic_break" };
  }

  const heading = tryParseHeading(ctx, trimmed);
  if (heading) return heading;

  return (
    tryParsePrimaryBlock(ctx, trimmed) ??
    tryParseNestedBlock(ctx, trimmed, lineIndent, indent, parseBlocks) ??
    tryParseSetextHeading(ctx) ??
    parseParagraph(ctx)
  );
}

function parseBlocks(ctx: ParseContext, indent: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  while (ctx.pos < ctx.lines.length) {
    const node = parseNextBlock(ctx, indent);
    if (node) blocks.push(node);
  }
  return blocks;
}
