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
    const ch = cursor.source[cursor.index];
    const start = cursor.index;

    if (ch === "`") {
      const close = cursor.source.indexOf("`", cursor.index + 1);
      if (close !== -1) {
        const value = cursor.source.slice(cursor.index + 1, close);
        const node: CodeSpanNode = {
          id: stableId(`code:${line}:${start}:${value}`),
          kind: "code_span",
          value,
          span: makeSpan(line, start, close + 1),
        };
        nodes.push(node);
        cursor.index = close + 1;
        continue;
      }
    }

    if (ch === "*" && cursor.source[cursor.index + 1] === "*") {
      const close = cursor.source.indexOf("**", cursor.index + 2);
      if (close !== -1) {
        const content = cursor.source.slice(cursor.index + 2, close);
        const node: StrongNode = {
          id: stableId(`strong:${line}:${start}:${content}`),
          kind: "strong",
          children: parseInlines(content, line),
          span: makeSpan(line, start, close + 2),
        };
        nodes.push(node);
        cursor.index = close + 2;
        continue;
      }
    }

    if (ch === "*") {
      const close = cursor.source.indexOf("*", cursor.index + 1);
      if (close !== -1) {
        const content = cursor.source.slice(cursor.index + 1, close);
        const node: EmphasisNode = {
          id: stableId(`em:${line}:${start}:${content}`),
          kind: "emphasis",
          children: parseInlines(content, line),
          span: makeSpan(line, start, close + 1),
        };
        nodes.push(node);
        cursor.index = close + 1;
        continue;
      }
    }

    if (ch === "[") {
      const startIndex = cursor.index;
      const label = parseBracketLabel(cursor);
      if (label !== null && cursor.source[cursor.index] === "(") {
        const href = parseParenHref(cursor);
        if (href !== null) {
          const node: LinkNode = {
            id: stableId(`link:${line}:${startIndex}:${href}:${label}`),
            kind: "link",
            href,
            children: parseInlines(label, line),
            span: makeSpan(line, startIndex, cursor.index),
          };
          nodes.push(node);
          continue;
        }
      }
      cursor.index = startIndex;
    }

    let end = cursor.index + 1;
    while (end < cursor.source.length) {
      const c = cursor.source[end];
      const c2 = cursor.source[end + 1];
      const stop =
        c === "`" || c === "[" || c === "*" || (c === "*" && c2 === "*");
      if (stop) break;
      end++;
    }

    const value = cursor.source.slice(cursor.index, end);
    nodes.push(textNode(value, line, cursor.index, end));
    cursor.index = end;
  }

  return mergeTextNodes(nodes);
}

function mergeTextNodes(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length <= 1) return nodes;
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === "text" && node.kind === "text") {
      const textPrev = prev as TextNode;
      const textNodeCurrent = node as TextNode;
      merged[merged.length - 1] = {
        ...textPrev,
        value: textPrev.value + textNodeCurrent.value,
        span: {
          ...textPrev.span,
          endOffset: textNodeCurrent.span.endOffset,
        },
      };
      continue;
    }
    merged.push(node);
  }
  return merged;
}
