/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parser.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown Parser — full CommonMark + GFM parser, zero dependencies

import type { BlockNode, DefinitionItem } from "./ast";
import { parseInline, slugify } from "./parserInline";
import {
  setInlineRefDefinitions,
  normalizeRefLabel,
  type InlineRefDefinition,
} from "./parserInlineMatchers";
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
  const allLines = markdown.split("\n");
  const frontMatter = parseFrontMatter(allLines);
  const { lines, definitions } = collectRefDefinitions(
    frontMatter ? allLines.slice(frontMatter.consumed) : allLines,
  );
  setInlineRefDefinitions(definitions.size > 0 ? definitions : null);
  try {
    const ctx: ParseContext = { lines, pos: 0 };
    const blocks = parseBlocks(ctx, 0);
    return frontMatter ? [frontMatter.node, ...blocks] : blocks;
  } finally {
    setInlineRefDefinitions(null);
  }
}

// YAML/TOML front matter — only at the very top of the document, fenced by a
// matching `---`/`+++` pair. Without a closing fence the opener stays what it
// always was: a thematic break.
function parseFrontMatter(
  lines: string[],
): { node: BlockNode; consumed: number } | null {
  const fence = lines[0]?.trim();
  if (fence !== "---" && fence !== "+++") return null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === fence || (fence === "---" && line === "...")) {
      return {
        node: { type: "front_matter", value: lines.slice(1, i).join("\n") },
        consumed: i + 1,
      };
    }
  }
  return null;
}

const REF_DEFINITION_RE =
  /^ {0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/;

/**
 * One fence-aware pre-pass: collect `[label]: url "title"` definitions and drop
 * those lines from the block stream (they render nothing). `[^label]:` stays —
 * that's a footnote. The `[//]: # (comment)` idiom is swallowed here for free.
 */
function collectRefDefinitions(lines: string[]): {
  lines: string[];
  definitions: Map<string, InlineRefDefinition>;
} {
  const definitions = new Map<string, InlineRefDefinition>();
  let fence: string | null = null;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (fence) {
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fence = trimmed.slice(0, 3);
      continue;
    }
    if (trimmed[0] !== "[" || trimmed[1] === "^") continue;
    const match = REF_DEFINITION_RE.exec(line);
    if (!match) continue;
    const href = match[2].replace(/^<(.*)>$/, "$1");
    const title = match[3] ?? match[4] ?? match[5];
    const label = normalizeRefLabel(match[1]);
    if (!definitions.has(label)) definitions.set(label, { href, title });
  }
  if (definitions.size === 0) return { lines, definitions };
  // Second pass: drop the definition lines from the block stream.
  const kept: string[] = [];
  fence = null;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!fence && trimmed[0] === "[" && trimmed[1] !== "^" && REF_DEFINITION_RE.test(line)) {
      continue;
    }
    if (fence && trimmed.startsWith(fence)) fence = null;
    else if (!fence && (trimmed.startsWith("```") || trimmed.startsWith("~~~"))) {
      fence = trimmed.slice(0, 3);
    }
    kept.push(line);
  }
  return { lines: kept, definitions };
}

const HEADING_CUSTOM_ID_RE = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

function splitHeadingCustomId(text: string): { text: string; id?: string } {
  const match = HEADING_CUSTOM_ID_RE.exec(text);
  if (!match) return { text };
  return { text: text.slice(0, match.index).trimEnd(), id: match[1] };
}

function tryParseHeading(ctx: ParseContext, trimmed: string): BlockNode | null {
  const hm = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(trimmed);
  if (!hm) return null;
  advance(ctx);
  const level = hm[1].length as 1 | 2 | 3 | 4 | 5 | 6;
  const { text, id } = splitHeadingCustomId(hm[2]);
  return {
    type: "heading",
    level,
    children: parseInline(text),
    id: id ?? slugify(text),
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

/** `<!-- … -->` block comment — consumed silently, renders nothing anywhere. */
function skipHtmlCommentBlock(ctx: ParseContext): void {
  while (ctx.pos < ctx.lines.length) {
    const line = advance(ctx);
    if (line.includes("-->")) return;
  }
}

const CONTAINER_OPEN_RE = /^:::\s*([A-Za-z][A-Za-z0-9_-]*)\s*(.*)$/;

/**
 * Pandoc-style fenced div: `:::name [params]` … bare `:::` closes. Containers
 * nest — an inner `:::name` opener deepens, each bare `:::` closes one level.
 * The editor's column layout serializes as `:::columns` / `:::column <ratio>`.
 */
function parseContainer(
  ctx: ParseContext,
  parseFn: ParseBlocksFn,
): BlockNode {
  const open = CONTAINER_OPEN_RE.exec(advance(ctx).trimStart());
  const kind = open?.[1].toLowerCase() ?? "div";
  const params = open?.[2].trim() || undefined;
  const innerLines: string[] = [];
  let depth = 1;
  while (ctx.pos < ctx.lines.length) {
    const line = ctx.lines[ctx.pos];
    const trimmed = line.trimStart();
    if (CONTAINER_OPEN_RE.test(trimmed)) depth += 1;
    else if (/^:::\s*$/.test(trimmed)) {
      depth -= 1;
      if (depth === 0) {
        advance(ctx);
        break;
      }
    }
    innerLines.push(line);
    advance(ctx);
  }
  const innerCtx: ParseContext = { lines: innerLines, pos: 0 };
  return { type: "container", kind, params, children: parseFn(innerCtx, 0) };
}

const DEFINITION_MARKER_RE = /^:\s+/;

function startsDefinitionList(ctx: ParseContext, trimmed: string): boolean {
  if (trimmed === "" || DEFINITION_MARKER_RE.test(trimmed)) return false;
  const next = ctx.lines[ctx.pos + 1];
  return next !== undefined && DEFINITION_MARKER_RE.test(next.trimStart());
}

/** `Term` + one or more `: definition` lines; groups may repeat back-to-back. */
function parseDefinitionList(ctx: ParseContext): BlockNode {
  const items: DefinitionItem[] = [];
  while (ctx.pos < ctx.lines.length) {
    const termLine = ctx.lines[ctx.pos].trim();
    if (termLine === "" || DEFINITION_MARKER_RE.test(termLine)) break;
    const next = ctx.lines[ctx.pos + 1];
    if (next === undefined || !DEFINITION_MARKER_RE.test(next.trimStart())) break;
    advance(ctx);
    const definitions: DefinitionItem["definitions"] = [];
    while (ctx.pos < ctx.lines.length) {
      const defLine = ctx.lines[ctx.pos].trimStart();
      if (!DEFINITION_MARKER_RE.test(defLine)) break;
      advance(ctx);
      definitions.push(parseInline(defLine.replace(DEFINITION_MARKER_RE, "")));
    }
    items.push({ term: parseInline(termLine), definitions });
  }
  return { type: "definition_list", items };
}

/** Try to parse a primary (non-nested) block from the current line. */
function tryParsePrimaryBlock(
  ctx: ParseContext,
  trimmed: string,
): BlockNode | null {
  const first = trimmed[0];
  if (first === "`" || first === "~") {
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~"))
      return parseFencedCode(ctx);
    return null;
  }
  if (first === "$") {
    if (trimmed.startsWith("$$")) return parseMathBlock(ctx);
    return null;
  }
  if (first === "<") {
    if (
      /^<([a-zA-Z][a-zA-Z0-9-]*)[\s>/]/.test(trimmed) &&
      isHtmlBlockTag(trimmed)
    )
      return parseHtmlBlock(ctx);
    return null;
  }
  if (trimmed.includes("|") && isTableStart(ctx)) return parseTable(ctx);
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
  const first = trimmed[0];
  if (first === ">" || first === "#") {
    if (/^>\s*(?:\[\s*>\s*\]|\[toggle\])\s*/i.test(trimmed) || /^#{1,6}>/.test(trimmed))
      return parseToggle(ctx, parseFn);
  }
  if (first === ">") {
    if (/^>\s*\[!([^\]]+?)\]/.test(trimmed)) return parseCallout(ctx, parseFn);
    if (trimmed.startsWith("> ") || trimmed === ">")
      return parseBlockquote(ctx, parseFn);
  }
  if (first === "-" || first === "*" || first === "+") {
    if (/^[-*+]\s+\[([ xX])\]\s/.test(trimmed))
      return parseTaskList(ctx, parseFn);
    if (/^[-*+]\s+/.test(trimmed) && !isThematicBreak(trimmed))
      return parseUnorderedList(ctx, parseFn);
  }
  if (first >= "0" && first <= "9" && /^\d{1,9}[.)]\s+/.test(trimmed))
    return parseOrderedList(ctx, parseFn);
  if (first === "[" && /^\[\^([^\]]+)\]:\s/.test(trimmed))
    return parseFootnoteDef(ctx, parseFn);
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
  if (trimmed.startsWith("<!--")) {
    skipHtmlCommentBlock(ctx);
    return null;
  }
  if (trimmed.startsWith(":::") && CONTAINER_OPEN_RE.test(trimmed)) {
    return parseContainer(ctx, parseBlocks);
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
    (startsDefinitionList(ctx, trimmed) ? parseDefinitionList(ctx) : null) ??
    tryParseSetextHeading(ctx) ??
    parseParagraph(ctx)
  );
}

function parseBlocks(ctx: ParseContext, indent: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  while (ctx.pos < ctx.lines.length) {
    const before = ctx.pos;
    const node = parseNextBlock(ctx, indent);
    if (node) blocks.push(node);
    // Hard progress guarantee: no parser may return without consuming input.
    // This can only trip on a parser bug — degrade to skipping one line
    // instead of looping forever on it.
    if (ctx.pos === before) advance(ctx);
  }
  return blocks;
}
