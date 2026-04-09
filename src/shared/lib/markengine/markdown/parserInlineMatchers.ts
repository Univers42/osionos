// Markdown parser — inline matcher definitions
import type { InlineNode } from "./ast";
import type {
  InlineMatchResult,
  InlineMatcher,
  InlineParser,
} from "./parserInlineTypes";
import { EMOJI_MAP } from "./parserEmoji";
import { findClosingBracket } from "./parserInlineUtils";

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

export function createInlineMatchers(
  parseInline: InlineParser,
): InlineMatcher[] {
  return [
    (text, pos) => {
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
    },
    (text, pos) => {
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
    },
    (text, pos) => {
      if (text[pos] !== "$" || text[pos + 1] === "$") return null;
      const close = text.indexOf("$", pos + 1);
      if (close === -1 || close === pos + 1) return null;
      return {
        start: pos,
        end: close + 1,
        node: { type: "math_inline", value: text.slice(pos + 1, close) },
      };
    },
    (text, pos) => {
      if (text[pos] !== "!" || text[pos + 1] !== "[") return null;
      const altClose = findClosingBracket(text, pos + 1);
      if (altClose === -1 || text[altClose + 1] !== "(") return null;
      const parenClose = text.indexOf(")", altClose + 2);
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
    },
    (text, pos) => {
      if (text[pos] !== "[") return null;
      const labelClose = findClosingBracket(text, pos);
      if (labelClose === -1 || text[labelClose + 1] !== "(") return null;
      const parenClose = text.indexOf(")", labelClose + 2);
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
    },
    (text, pos) => {
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
    },
    (text, pos) => {
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
    },
    (text, pos) =>
      matchDelimited(text, pos, "==", "==", parseInline, (children) => ({
        type: "highlight",
        children,
      })),
    (text, pos) =>
      matchDelimited(text, pos, "***", "***", parseInline, (children) => ({
        type: "bold_italic",
        children,
      })) ??
      matchDelimited(text, pos, "___", "___", parseInline, (children) => ({
        type: "bold_italic",
        children,
      })),
    (text, pos) =>
      matchDelimited(text, pos, "**", "**", parseInline, (children) => ({
        type: "bold",
        children,
      })),
    (text, pos) =>
      matchDelimited(text, pos, "__", "__", parseInline, (children) => ({
        type: "underline",
        children,
      })),
    (text, pos) =>
      matchDelimited(text, pos, "~~", "~~", parseInline, (children) => ({
        type: "strikethrough",
        children,
      })),
    (text, pos) => {
      if (text[pos] !== "*" && text[pos] !== "_") return null;
      const c = text[pos];
      if (pos > 0 && text[pos - 1] === c) return null; // part of an existing run
      if (text[pos + 1] === c) return null; // double = bold, not italic
      const close = findSingleEmphasisClose(text, pos, c as "*" | "_");
      if (close === -1 || close === pos + 1) return null;
      if (c === "_") {
        if (pos > 0 && /\w/.test(text[pos - 1])) return null;
        if (close + 1 < text.length && /\w/.test(text[close + 1])) return null;
      }
      const inner = text.slice(pos + 1, close);
      return {
        start: pos,
        end: close + 1,
        node: { type: "italic", children: parseInline(inner) },
      };
    },
    (text, pos) => {
      const chunk = text.slice(pos);
      const br = /^<br\s*\/?>/i.exec(chunk);
      if (!br) return null;
      return {
        start: pos,
        end: pos + br[0].length,
        node: { type: "line_break" },
      };
    },
    (text, pos) => {
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
    },
  ];
}
