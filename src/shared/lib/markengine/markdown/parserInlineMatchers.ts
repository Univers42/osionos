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
import { hostnameFromUrl } from "./urlSugar";
import { normalizeInlineLinkHref } from "../inlineLinks";

// A bare URL not already wrapped in `[]()` or `<>` — its href is the full URL,
// its visible label is the hostname (so it renders blue, not the "pure url").
// Trailing sentence punctuation is left outside the link. Two forms: fully
// schemed (`https://…`) and scheme-less `www.…` (normalized to https below).
export const BARE_URL_RE = /^https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/;
export const BARE_WWW_RE = /^www\.[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/i;

// Non-anchored twin of the two bare-URL matchers (leading `^` dropped) so the editor's
// live-render gate can ask "does this source contain a bare-URL shape anywhere?" — a
// scheme-less `www.…`/`https://…` must re-render while typing, but the char-class gate
// deliberately has no `.`/`/` trigger. Reuses the SAME patterns (not a lone `.`) so
// ordinary prose with sentence periods never over-triggers.
const BARE_URL_SHAPE_RE = new RegExp(
  `${BARE_URL_RE.source.slice(1)}|${BARE_WWW_RE.source.slice(1)}`,
  "i",
);

/** True when `text` contains a bare (scheme-less `www.` or fully-schemed) URL shape. */
export function containsBareUrlShape(text: string): boolean {
  return BARE_URL_SHAPE_RE.test(text);
}

function matchBareUrl(text: string, pos: number): InlineMatchResult | null {
  // Only at a boundary: never mid-word (e.g. "ahttps://") or after url-ish chars.
  if (pos > 0 && /[\w@/.-]/.test(text[pos - 1])) return null;
  const slice = text.slice(pos);
  const match = BARE_URL_RE.exec(slice) ?? BARE_WWW_RE.exec(slice);
  if (!match) return null;
  const raw = match[0];
  // Autolink only once the URL is followed by something (space/punctuation/text),
  // i.e. "on space" — a URL still at the caret's end stays plain text so typing it
  // isn't disrupted by an early collapse to the hostname label.
  if (pos + raw.length >= text.length) return null;
  // Scheme-less `www.` hosts resolve to https so the anchor label + href agree.
  const href = normalizeInlineLinkHref(raw);
  return {
    start: pos,
    end: pos + raw.length,
    node: { type: "link", href, children: [{ type: "text", value: hostnameFromUrl(href) }] },
  };
}

// Reversed link sugar `(text)[url]` — the inverse of standard `[text](url)`.
// Notion is forgiving: users type the brackets swapped by mistake. Only fires
// when a `)` is immediately followed by a `[…]` destination, so a plain
// `(parenthetical remark)` with no trailing `[…]` stays inert text.
function matchReversedLink(
  text: string,
  pos: number,
  parseInline: InlineParser,
): InlineMatchResult | null {
  if (text[pos] !== "(") return null;
  const parenClose = text.indexOf(")", pos + 1);
  if (parenClose === -1 || parenClose === pos + 1) return null; // no text, e.g. "()"
  if (text[parenClose + 1] !== "[") return null; // must be `(text)[…]`
  const bracketClose = text.indexOf("]", parenClose + 2);
  if (bracketClose === -1) return null;
  const rawUrl = text.slice(parenClose + 2, bracketClose).trim();
  if (!rawUrl) return null; // `(text)[]` is not a link
  const label = text.slice(pos + 1, parenClose);
  return {
    start: pos,
    end: bracketClose + 1,
    node: {
      type: "link",
      href: normalizeInlineLinkHref(rawUrl),
      children: parseInline(label),
    },
  };
}

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

/** Emphasis delimiters that STACK ("*"/"**"/"***"), so a run length is meaningful. */
const STACKING_DELIMITERS = new Set(["*", "_"]);

/**
 * CommonMark: an opening delimiter RUN longer than the delimiter being matched does
 * not open here — the surplus stays OUTSIDE the span as literal text ("***foo**" is
 * `*<strong>foo</strong>`, not `<strong>*foo</strong>`).
 *
 * Without this, "**" happily opened at the FIRST star of "***hello**" and swallowed
 * the third star into the content -> bold("*hello"). Live, that made "***bold
 * italic***" impossible to ever close: the stray "*" was stranded inside the mark and
 * the user's last "*" landed outside it. Refusing here lets the parser emit the extra
 * "*" as text and re-match the clean "**" one char later.
 *
 * Scoped to "*"/"_": "~~", "==" and backticks do not stack, and a run guard there
 * would wrongly reject things like a ``double-backtick`` code span.
 */
function opensOverlongRun(text: string, pos: number, open: string): boolean {
  const delim = open[0];
  if (!STACKING_DELIMITERS.has(delim) || open !== delim.repeat(open.length)) return false;
  let runEnd = pos;
  while (runEnd < text.length && text[runEnd] === delim) runEnd += 1;
  return runEnd - pos > open.length;
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
  if (opensOverlongRun(text, pos, open)) return null;
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
      const href = normalizeInlineLinkHref(titleMatch ? titleMatch[1] : inside);
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
    defineMatcher(["("], (text, pos) => matchReversedLink(text, pos, parseInline)),
    defineMatcher(["h", "w"], matchBareUrl),
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
