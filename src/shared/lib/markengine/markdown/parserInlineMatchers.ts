/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserInlineMatchers.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — inline matcher definitions
import type { InlineNode } from "./ast";
import type {
  InlineMatchResult,
  InlineMatcher,
  InlineParser,
} from "./parserInlineTypes";
import { EMOJI_MAP } from "./parserEmoji";
import { findClosingBracket } from "./parserInlineUtils";

type InlineMatcherSpec = {
  firstChars: readonly string[];
  matcher: InlineMatcher;
};

function defineMatcher(
  firstChars: readonly string[],
  matcher: InlineMatcher,
): InlineMatcherSpec {
  return { firstChars, matcher };
}

function matchDelimited(
  text: string,
  pos: number,
  open: string,
  close: string,
  parseInline: InlineParser,
  factory: (children: InlineNode[]) => InlineNode,
): InlineMatchResult | null {
  if (!text.startsWith(open, pos)) return null;
  const start = pos + open.length;
  const end = text.indexOf(close, start);
  if (end === -1 || end === start) return null;
  const inner = text.slice(start, end);
  return {
    start: pos,
    end: end + close.length,
    node: factory(parseInline(inner)),
  };
}

function matchTaggedInlineColor(
  text: string,
  pos: number,
  tag: "color" | "bg",
  parseInline: InlineParser,
  factory: (color: string, children: InlineNode[]) => InlineNode,
): InlineMatchResult | null {
  const opener = `[${tag}=`;
  if (!text.startsWith(opener, pos)) return null;

  const bracketEnd = text.indexOf("]", pos + opener.length);
  if (bracketEnd === -1) return null;

  const openLength = bracketEnd - pos + 1;
  const start = pos + openLength;
  const closeTag = `[/${tag}]`;
  const end = findMatchingTaggedClose(text, start, tag, true);
  if (end === -1 || end === start) return null;

  const color = text.slice(pos + opener.length, bracketEnd).trim();
  const inner = text.slice(start, end);
  return {
    start: pos,
    end: end + closeTag.length,
    node: factory(color, parseInline(inner)),
  };
}

function matchTaggedInlineChildren(
  text: string,
  pos: number,
  tag: string,
  parseInline: InlineParser,
  factory: (children: InlineNode[]) => InlineNode,
): InlineMatchResult | null {
  const openTag = `[${tag}]`;
  if (!text.startsWith(openTag, pos)) return null;

  const start = pos + openTag.length;
  const closeTag = `[/${tag}]`;
  const end = findMatchingTaggedClose(text, start, tag, false);
  if (end === -1 || end === start) return null;

  const inner = text.slice(start, end);
  return {
    start: pos,
    end: end + closeTag.length,
    node: factory(parseInline(inner)),
  };
}

function findMatchingTaggedClose(
  text: string,
  start: number,
  tag: string,
  hasAttribute: boolean,
): number {
  const closeTag = `[/${tag}]`;
  let depth = 1;
  let cursor = start;

  while (cursor < text.length) {
      const token = findNextTaggedToken(text, cursor, tag, closeTag, hasAttribute);
      if (!token) return -1;

      if (token.kind === "open") {
      depth += 1;
        cursor = token.nextCursor;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
        return token.index;
    }

      cursor = token.index + closeTag.length;
  }

  return -1;
}

  type TaggedToken =
    | { kind: "open"; nextCursor: number }
    | { kind: "close"; index: number };

  function findNextTaggedToken(
    text: string,
    cursor: number,
    tag: string,
    closeTag: string,
    hasAttribute: boolean,
  ): TaggedToken | null {
    const closeIndex = text.indexOf(closeTag, cursor);
    if (closeIndex === -1) return null;

    const nextOpenCursor = findNextTaggedOpen(text, cursor, tag, closeIndex, hasAttribute);
    return nextOpenCursor === -1
      ? { kind: "close", index: closeIndex }
      : { kind: "open", nextCursor: nextOpenCursor };
  }

  function findNextTaggedOpen(
    text: string,
    cursor: number,
    tag: string,
    closeIndex: number,
    hasAttribute: boolean,
  ): number {
    const openTag = hasAttribute ? `[${tag}=` : `[${tag}]`;
    const candidate = text.indexOf(openTag, cursor);
    if (candidate === -1 || candidate >= closeIndex) return -1;

    if (!hasAttribute) return candidate + openTag.length;

    const bracketEnd = text.indexOf("]", candidate + openTag.length);
    return bracketEnd === -1 ? -1 : bracketEnd + 1;
  }

function findSingleEmphasisClose(
  text: string,
  pos: number,
  marker: "*" | "_",
): number {
  for (let i = pos + 1; i < text.length; i++) {
    if (text[i] !== marker) continue;

    // Single emphasis must not bind to a delimiter that belongs to a run.
    if (text[i - 1] === marker || text[i + 1] === marker) continue;

    return i;
  }
  return -1;
}

function findDestinationClose(text: string, start: number): number {
  let depth = 0;
  for (let cursor = start; cursor < text.length; cursor++) {
    const char = text[cursor];
    if (char === "\\") {
      cursor++;
      continue;
    }
    if (char === "(") {
      depth++;
      continue;
    }
    if (char !== ")") continue;
    if (depth === 0) return cursor;
    depth--;
  }
  return -1;
}

export function createInlineDispatch(
  parseInline: InlineParser,
): Record<string, InlineMatcher[]> {
  const specs: InlineMatcherSpec[] = [
    defineMatcher(["\\"], (text, pos) => {
      if (text[pos] !== "\\" || pos + 1 >= text.length) return null;
      const next = text[pos + 1];
      if ("\\`*_{}[]()#+-.!|~$=".includes(next)) {
        return {
          start: pos,
          end: pos + 2,
          node: { type: "text", value: next },
        };
      }
      return null;
    }),
    defineMatcher(["`"], (text, pos) => {
      if (text[pos] !== "`") return null;
      let ticks = 0;
      let i = pos;
      while (i < text.length && text[i] === "`") {
        ticks++;
        i++;
      }
      const closePattern = "`".repeat(ticks);
      const closeIdx = text.indexOf(closePattern, i);
      if (closeIdx === -1) return null;
      if (closeIdx + ticks < text.length && text[closeIdx + ticks] === "`")
        return null;
      const value = text
        .slice(i, closeIdx)
        .replaceAll("\n", " ")
        .replace(/^ (.+) $/, "$1");
      return {
        start: pos,
        end: closeIdx + ticks,
        node: { type: "code", value },
      };
    }),
    defineMatcher(["$"], (text, pos) => {
      if (text[pos] !== "$" || text[pos + 1] === "$") return null;
      const close = text.indexOf("$", pos + 1);
      if (close === -1 || close === pos + 1) return null;
      return {
        start: pos,
        end: close + 1,
        node: { type: "math_inline", value: text.slice(pos + 1, close) },
      };
    }),
    defineMatcher(["!"], (text, pos) => {
      if (text[pos] !== "!" || text[pos + 1] !== "[") return null;
      const altClose = findClosingBracket(text, pos + 1);
      if (altClose === -1 || text[altClose + 1] !== "(") return null;
      const parenClose = findDestinationClose(text, altClose + 2);
      if (parenClose === -1) return null;
      const alt = text.slice(pos + 2, altClose);
      const inside = text.slice(altClose + 2, parenClose).trim();
      const titleMatch = /^(.*?)\s+"([^"]*)"$/.exec(inside);
      const src = titleMatch ? titleMatch[1] : inside;
      const title = titleMatch ? titleMatch[2] : undefined;
      return {
        start: pos,
        end: parenClose + 1,
        node: { type: "image", src, alt, title },
      };
    }),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineColor(text, pos, "color", parseInline, (color, children) => ({
        type: "text_color",
        color,
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineColor(text, pos, "bg", parseInline, (color, children) => ({
        type: "background_color",
        color,
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "code", parseInline, (children) => ({
        type: "code_rich",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "b", parseInline, (children) => ({
        type: "bold",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "i", parseInline, (children) => ({
        type: "italic",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "s", parseInline, (children) => ({
        type: "strikethrough",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "u", parseInline, (children) => ({
        type: "underline",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) =>
      matchTaggedInlineChildren(text, pos, "mark", parseInline, (children) => ({
        type: "highlight",
        children,
      })),
    ),
    defineMatcher(["["], (text, pos) => {
      if (text[pos] !== "[" || text[pos + 1] !== "[") return null;
      const match = /^\[\[page:([^\]]+)\]\]/.exec(text.slice(pos));
      if (!match) return null;
      return {
        start: pos,
        end: pos + match[0].length,
        node: { type: "internal_link", pageId: match[1] },
      };
    }),
    defineMatcher(["["], (text, pos) => {
      if (text[pos] !== "[") return null;
      const labelClose = findClosingBracket(text, pos);
      if (labelClose === -1 || text[labelClose + 1] !== "(") return null;
      const parenClose = findDestinationClose(text, labelClose + 2);
      if (parenClose === -1) return null;
      const label = text.slice(pos + 1, labelClose);
      const inside = text.slice(labelClose + 2, parenClose).trim();
      const titleMatch = /^(.*?)\s+"([^"]*)"$/.exec(inside);
      const href = titleMatch ? titleMatch[1] : inside;
      const title = titleMatch ? titleMatch[2] : undefined;
      return {
        start: pos,
        end: parenClose + 1,
        node: { type: "link", href, title, children: parseInline(label) },
      };
    }),
    defineMatcher(["["], (text, pos) => {
      if (text[pos] !== "[" || text[pos + 1] !== "^") return null;
      const close = text.indexOf("]", pos + 2);
      if (close === -1 || text[close + 1] === "(") return null;
      const label = text.slice(pos + 2, close);
      if (!label || /\s/.test(label)) return null;
      return {
        start: pos,
        end: close + 1,
        node: { type: "footnote_ref", label },
      };
    }),
    defineMatcher([":"], (text, pos) => {
      if (text[pos] !== ":") return null;
      const match = /^:([a-zA-Z0-9_+-]+):/.exec(text.slice(pos));
      if (!match) return null;
      const name = match[1];
      const emoji = EMOJI_MAP[name];
      if (!emoji) return null;
      return {
        start: pos,
        end: pos + match[0].length,
        node: { type: "emoji", value: emoji, raw: name },
      };
    }),
    defineMatcher(["="], (text, pos) =>
      matchDelimited(text, pos, "==", "==", parseInline, (children) => ({
        type: "highlight",
        children,
      })),
    ),
    defineMatcher(["*", "_"], (text, pos) =>
      matchDelimited(text, pos, "***", "***", parseInline, (children) => ({
        type: "bold_italic",
        children,
      })) ??
      matchDelimited(text, pos, "___", "___", parseInline, (children) => ({
        type: "bold_italic",
        children,
      })),
    ),
    defineMatcher(["*"], (text, pos) =>
      matchDelimited(text, pos, "**", "**", parseInline, (children) => ({
        type: "bold",
        children,
      })),
    ),
    defineMatcher(["_"], (text, pos) =>
      matchDelimited(text, pos, "__", "__", parseInline, (children) => ({
        type: "underline",
        children,
      })),
    ),
    defineMatcher(["~"], (text, pos) =>
      matchDelimited(text, pos, "~~", "~~", parseInline, (children) => ({
        type: "strikethrough",
        children,
      })),
    ),
    defineMatcher(["*", "_"], (text, pos) => {
      const marker = text[pos];
      if (marker !== "*" && marker !== "_") return null;
      if (pos > 0 && text[pos - 1] === marker) return null; // part of an existing run
      if (text[pos + 1] === marker) return null; // double = bold, not italic
      const close = findSingleEmphasisClose(text, pos, marker);
      if (close === -1 || close === pos + 1) return null;
      if (marker === "_") {
        if (pos > 0 && /\w/.test(text[pos - 1])) return null;
        if (close + 1 < text.length && /\w/.test(text[close + 1])) return null;
      }
      const inner = text.slice(pos + 1, close);
      return {
        start: pos,
        end: close + 1,
        node: { type: "italic", children: parseInline(inner) },
      };
    }),
    defineMatcher(["<"], (text, pos) => {
      const chunk = text.slice(pos);
      const br = /^<br\s*\/?>/i.exec(chunk);
      if (!br) return null;
      return {
        start: pos,
        end: pos + br[0].length,
        node: { type: "line_break" },
      };
    }),
    defineMatcher(["<"], (text, pos) => {
      if (text[pos] !== "<") return null;
      const close = text.indexOf(">", pos + 1);
      if (close === -1) return null;
      const inner = text.slice(pos + 1, close);
      if (/^https?:\/\//.test(inner)) {
        return {
          start: pos,
          end: close + 1,
          node: {
            type: "link",
            href: inner,
            children: [{ type: "text", value: inner }],
          },
        };
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inner)) {
        return {
          start: pos,
          end: close + 1,
          node: {
            type: "link",
            href: `mailto:${inner}`,
            children: [{ type: "text", value: inner }],
          },
        };
      }
      return null;
    }),
  ];

  const dispatch: Record<string, InlineMatcher[]> = {};
  for (const spec of specs) {
    for (const firstChar of spec.firstChars) {
      dispatch[firstChar] ??= [];
      dispatch[firstChar].push(spec.matcher);
    }
  }

  return dispatch;
}
