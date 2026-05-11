/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inline-parser.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:27:46 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:27:47 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  CodeSpanNode,
  EmphasisNode,
  InlineNode,
  LinkNode,
  SourceSpan,
  StrongNode,
  TextNode,
} from "./types";
import { stableId } from "./utils";

interface Cursor {
  source: string;
  index: number;
  line: number;
  globalStartLine: number;
}

function makeSpan(
  line: number,
  startOffset: number,
  endOffset: number,
): SourceSpan {
  return {
    startLine: line,
    endLine: line,
    startOffset,
    endOffset,
  };
}

function textNode(
  value: string,
  line: number,
  start: number,
  end: number,
): TextNode {
  return {
    id: stableId(`txt:${line}:${start}:${value}`),
    kind: "text",
    value,
    span: makeSpan(line, start, end),
  };
}

function parseBracketLabel(cursor: Cursor): string | null {
  if (cursor.source[cursor.index] !== "[") return null;
  let i = cursor.index + 1;
  while (i < cursor.source.length && cursor.source[i] !== "]") i++;
  if (i >= cursor.source.length) return null;
  const label = cursor.source.slice(cursor.index + 1, i);
  cursor.index = i + 1;
  return label;
}

function parseParenHref(cursor: Cursor): string | null {
  if (cursor.source[cursor.index] !== "(") return null;
  let i = cursor.index + 1;
  while (i < cursor.source.length && cursor.source[i] !== ")") i++;
  if (i >= cursor.source.length) return null;
  const href = cursor.source.slice(cursor.index + 1, i).trim();
  cursor.index = i + 1;
  return href || null;
}

export function parseInlines(source: string, line: number): InlineNode[] {
  const cursor: Cursor = {
    source,
    index: 0,
    line,
    globalStartLine: line,
  };

  const nodes: InlineNode[] = [];

  while (cursor.index < cursor.source.length) {
    nodes.push(parseInlineNode(cursor, line));
  }

  return mergeTextNodes(nodes);
}

function parseInlineNode(cursor: Cursor, line: number): InlineNode {
  return (
    parseCodeSpanNode(cursor, line) ??
    parseStrongNode(cursor, line) ??
    parseEmphasisNode(cursor, line) ??
    parseLinkNode(cursor, line) ??
    parseTextRun(cursor, line)
  );
}

function parseCodeSpanNode(cursor: Cursor, line: number): CodeSpanNode | null {
  if (cursor.source[cursor.index] !== "`") return null;
  const start = cursor.index;
  const close = cursor.source.indexOf("`", start + 1);
  if (close === -1) return null;

  const value = cursor.source.slice(start + 1, close);
  cursor.index = close + 1;
  return {
    id: stableId(`code:${line}:${start}:${value}`),
    kind: "code_span",
    value,
    span: makeSpan(line, start, cursor.index),
  };
}

function parseStrongNode(cursor: Cursor, line: number): StrongNode | null {
  if (!cursor.source.startsWith("**", cursor.index)) return null;
  const start = cursor.index;
  const close = cursor.source.indexOf("**", start + 2);
  if (close === -1) return null;

  const content = cursor.source.slice(start + 2, close);
  cursor.index = close + 2;
  return {
    id: stableId(`strong:${line}:${start}:${content}`),
    kind: "strong",
    children: parseInlines(content, line),
    span: makeSpan(line, start, cursor.index),
  };
}

function parseEmphasisNode(cursor: Cursor, line: number): EmphasisNode | null {
  if (cursor.source[cursor.index] !== "*") return null;
  const start = cursor.index;
  const close = cursor.source.indexOf("*", start + 1);
  if (close === -1) return null;

  const content = cursor.source.slice(start + 1, close);
  cursor.index = close + 1;
  return {
    id: stableId(`em:${line}:${start}:${content}`),
    kind: "emphasis",
    children: parseInlines(content, line),
    span: makeSpan(line, start, cursor.index),
  };
}

function parseLinkNode(cursor: Cursor, line: number): LinkNode | null {
  if (cursor.source[cursor.index] !== "[") return null;
  const start = cursor.index;
  const label = parseBracketLabel(cursor);
  if (label === null) {
    cursor.index = start;
    return null;
  }

  const href = parseParenHref(cursor);
  if (href === null) {
    cursor.index = start;
    return null;
  }

  return {
    id: stableId(`link:${line}:${start}:${href}:${label}`),
    kind: "link",
    href,
    children: parseInlines(label, line),
    span: makeSpan(line, start, cursor.index),
  };
}

function parseTextRun(cursor: Cursor, line: number): TextNode {
  const start = cursor.index;
  let end = start + 1;
  while (end < cursor.source.length && !isInlineTokenStart(cursor.source[end])) {
    end++;
  }

  const value = cursor.source.slice(start, end);
  cursor.index = end;
  return textNode(value, line, start, end);
}

function isInlineTokenStart(char: string): boolean {
  return char === "`" || char === "[" || char === "*";
}

function mergeTextNodes(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length <= 1) return nodes;
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const prev = merged.at(-1);
    if (prev?.kind === "text" && node.kind === "text") {
      merged[merged.length - 1] = {
        ...prev,
        value: prev.value + node.value,
        span: {
          ...prev.span,
          endOffset: node.span.endOffset,
        },
      };
      continue;
    }
    merged.push(node);
  }
  return merged;
}
