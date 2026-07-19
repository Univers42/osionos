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

// CommonMark: every ASCII punctuation character is backslash-escapable.
const ESCAPABLE_PUNCTUATION = /[!-/:-@[-`{-~]/;

// A bare URL not already wrapped in `[]()` or `<>` — its href is the full URL,
// its visible label is the hostname (so it renders blue, not the "pure url").
// Trailing sentence punctuation is left outside the link. Two forms: fully
// schemed (`https://…`) and scheme-less `www.…` (normalized to https below).
export const BARE_URL_RE = /^https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/;
export const BARE_WWW_RE = /^www\.[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/i;

// Sticky twins for the hot matcher path — matching at an offset without the
// `text.slice(pos)` allocation the anchored forms would force on every h/w char.
const BARE_URL_STICKY = /https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/y;
const BARE_WWW_STICKY = /www\.[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/iy;
const EMOJI_STICKY = /:([a-zA-Z0-9_+-]+):/y;

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

function execSticky(re: RegExp, text: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos;
  return re.exec(text);
}

function matchBareUrl(text: string, pos: number): InlineMatchResult | null {
  // Only at a boundary: never mid-word (e.g. "ahttps://") or after url-ish chars.
  if (pos > 0 && /[\w@/.-]/.test(text[pos - 1])) return null;
  const match =
    execSticky(BARE_URL_STICKY, text, pos) ?? execSticky(BARE_WWW_STICKY, text, pos);
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

// Hoisted node factories for the `[` tag forms (shared by the composite matcher).
const makeTextColor = (color: string, children: InlineNode[]): InlineNode => ({
  type: "text_color",
  color,
  children,
});
const makeBackgroundColor = (color: string, children: InlineNode[]): InlineNode => ({
  type: "background_color",
  color,
  children,
});
const makeCodeRich = (children: InlineNode[]): InlineNode => ({ type: "code_rich", children });
const makeBold = (children: InlineNode[]): InlineNode => ({ type: "bold", children });
const makeItalic = (children: InlineNode[]): InlineNode => ({ type: "italic", children });
const makeStrikethrough = (children: InlineNode[]): InlineNode => ({
  type: "strikethrough",
  children,
});
const makeUnderline = (children: InlineNode[]): InlineNode => ({ type: "underline", children });
const makeHighlight = (children: InlineNode[]): InlineNode => ({ type: "highlight", children });

const PAGE_LINK_STICKY = /\[\[page:([^\]]+)\]\]/y;

function matchPageLink(text: string, pos: number): InlineMatchResult | null {
  const match = execSticky(PAGE_LINK_STICKY, text, pos);
  if (!match) return null;
  return {
    start: pos,
    end: pos + match[0].length,
    node: { type: "internal_link", pageId: match[1] },
  };
}

function matchStandardLink(
  text: string,
  pos: number,
  parseInline: InlineParser,
): InlineMatchResult | null {
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
}

function matchFootnoteRef(text: string, pos: number): InlineMatchResult | null {
  if (text[pos + 1] !== "^") return null;
  const close = text.indexOf("]", pos + 2);
  if (close === -1 || text[close + 1] === "(") return null;
  const label = text.slice(pos + 2, close);
  if (!label || /\s/.test(label)) return null;
  return {
    start: pos,
    end: close + 1,
    node: { type: "footnote_ref", label },
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

/**
 * Pandoc-style tight span (`~sub~` / `^sup^`): single-char delimiter, the inner
 * text may not contain whitespace or the delimiter, so prose like "x ~ y" and
 * "5 ^ 2" stays literal.
 */
function matchTightDelimited(
  text: string,
  pos: number,
  delim: string,
  parseInline: InlineParser,
  factory: (children: InlineNode[]) => InlineNode,
): InlineMatchResult | null {
  if (text[pos] !== delim || text[pos + 1] === delim) return null;
  let cursor = pos + 1;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === delim) break;
    if (ch === " " || ch === "\t" || ch === "\n") return null;
    cursor += 1;
  }
  if (cursor >= text.length || cursor === pos + 1) return null;
  return {
    start: pos,
    end: cursor + 1,
    node: factory(parseInline(text.slice(pos + 1, cursor))),
  };
}

// Paired inline HTML tags with a direct AST meaning — the HTML-fallback forms
// (`<sub>`, `<kbd>`, `<mark>`, `<u>`…) parse into the same nodes as their
// markdown sugar, so they render styled instead of leaking literal tags.
const INLINE_HTML_TAG_TO_NODE: Record<string, (children: InlineNode[]) => InlineNode> = {
  sub: (children) => ({ type: "subscript", children }),
  sup: (children) => ({ type: "superscript", children }),
  kbd: (children) => ({ type: "kbd", children }),
  mark: (children) => ({ type: "highlight", children }),
  ins: (children) => ({ type: "underline", children }),
  u: (children) => ({ type: "underline", children }),
  b: (children) => ({ type: "bold", children }),
  strong: (children) => ({ type: "bold", children }),
  i: (children) => ({ type: "italic", children }),
  em: (children) => ({ type: "italic", children }),
  del: (children) => ({ type: "strikethrough", children }),
  s: (children) => ({ type: "strikethrough", children }),
  strike: (children) => ({ type: "strikethrough", children }),
};

const INLINE_HTML_OPEN_RE = /^<([a-zA-Z]+)>/;

function matchInlineHtmlTag(
  text: string,
  pos: number,
  parseInline: InlineParser,
): InlineMatchResult | null {
  const open = INLINE_HTML_OPEN_RE.exec(text.slice(pos, pos + 12));
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const factory = INLINE_HTML_TAG_TO_NODE[tag];
  if (!factory) return null;
  const closeTag = `</${tag}>`;
  const close = text.toLowerCase().indexOf(closeTag, pos + open[0].length);
  if (close === -1) return null;
  const inner = text.slice(pos + open[0].length, close);
  return {
    start: pos,
    end: close + closeTag.length,
    node: factory(parseInline(inner)),
  };
}

/** `<!-- … -->` consumes silently — comments never reach the rendered output. */
function matchInlineComment(text: string, pos: number): InlineMatchResult | null {
  if (!text.startsWith("<!--", pos)) return null;
  const close = text.indexOf("-->", pos + 4);
  if (close === -1) return null;
  return { start: pos, end: close + 3, node: null };
}

// ─── Reference links ──────────────────────────────────────────────────────────
//
// `[text][label]`, collapsed `[text][]`, shortcut `[text]`, and `![alt][label]`
// resolve against the document's `[label]: url "title"` definitions. The parser
// collects definitions before block parsing and scopes them here for the
// duration of one `parse()` call (parsing is synchronous, so a module slot is
// safe and keeps the matcher signature unchanged).

export interface InlineRefDefinition {
  href: string;
  title?: string;
}

let activeRefDefinitions: Map<string, InlineRefDefinition> | null = null;

export function setInlineRefDefinitions(
  definitions: Map<string, InlineRefDefinition> | null,
): void {
  activeRefDefinitions = definitions;
}

export function normalizeRefLabel(label: string): string {
  return label.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function lookupRefDefinition(label: string): InlineRefDefinition | null {
  if (!activeRefDefinitions) return null;
  return activeRefDefinitions.get(normalizeRefLabel(label)) ?? null;
}

function matchReferenceLink(
  text: string,
  pos: number,
  parseInline: InlineParser,
): InlineMatchResult | null {
  if (text[pos] !== "[" || !activeRefDefinitions) return null;
  const labelClose = findClosingBracket(text, pos);
  if (labelClose === -1) return null;
  if (text[labelClose + 1] === "(") return null; // inline `[text](url)` wins
  const textPart = text.slice(pos + 1, labelClose);
  let refLabel = textPart;
  let end = labelClose + 1;
  if (text[labelClose + 1] === "[") {
    const refClose = text.indexOf("]", labelClose + 2);
    if (refClose === -1) return null;
    const explicit = text.slice(labelClose + 2, refClose);
    if (explicit) refLabel = explicit; // `[text][]` collapses to the text
    end = refClose + 1;
  }
  const definition = lookupRefDefinition(refLabel);
  if (!definition) return null;
  return {
    start: pos,
    end,
    node: {
      type: "link",
      href: definition.href,
      title: definition.title,
      children: parseInline(textPart),
    },
  };
}

function matchReferenceImage(
  text: string,
  pos: number,
): InlineMatchResult | null {
  if (text[pos] !== "!" || text[pos + 1] !== "[" || !activeRefDefinitions) return null;
  const altClose = findClosingBracket(text, pos + 1);
  if (altClose === -1) return null;
  if (text[altClose + 1] === "(") return null; // inline `![alt](src)` wins
  const alt = text.slice(pos + 2, altClose);
  let refLabel = alt;
  let end = altClose + 1;
  if (text[altClose + 1] === "[") {
    const refClose = text.indexOf("]", altClose + 2);
    if (refClose === -1) return null;
    const explicit = text.slice(altClose + 2, refClose);
    if (explicit) refLabel = explicit;
    end = refClose + 1;
  }
  const definition = lookupRefDefinition(refLabel);
  if (!definition) return null;
  return {
    start: pos,
    end,
    node: { type: "image", src: definition.href, alt, title: definition.title },
  };
}

// ─── Stacked emphasis (* and _) ───────────────────────────────────────────────
//
// * and _ are the only delimiters whose RUN LENGTH means something ("*", "**",
// "***", "****"…), and whose runs may close in parts ("***a** b*"). One resolver
// handles every combination; the dialect keeps the editor's mark mapping:
//   1 → italic · 2 → bold ("*") / underline ("_") · 3 → bold_italic ·
//   4+ → nested pairs, italic innermost when odd (so "****x****" is bold-in-bold
//   and "*****x*****" renders bold italic — no 4th style exists).
// An overlong opener leaves its surplus OUTSIDE the span as literal text
// ("***foo**" → *<strong>foo</strong>), matching CommonMark and the editor's
// pinned intermediate typing states.

type StackingMarker = "*" | "_";

const CODE_BACKSLASH = 92;
const CODE_BACKTICK = 96;

function runLengthAt(text: string, pos: number, ch: string): number {
  let end = pos;
  while (end < text.length && text[end] === ch) end += 1;
  return end - pos;
}

function runLengthAtCode(text: string, pos: number, code: number): number {
  let end = pos;
  while (end < text.length && text.charCodeAt(end) === code) end += 1;
  return end - pos;
}

/** Out-of-range charCodeAt yields NaN — every comparison below stays false, so
 *  callers treat "before start"/"past end" explicitly where it matters. */
function isWhitespaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isBoundaryCode(code: number): boolean {
  return Number.isNaN(code) || isWhitespaceCode(code);
}

function isWordCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    code === 95
  );
}

function wrapEmphasis(
  marker: StackingMarker,
  take: number,
  children: InlineNode[],
): InlineNode {
  if (take === 1) return { type: "italic", children };
  if (take === 2)
    return marker === "*"
      ? { type: "bold", children }
      : { type: "underline", children };
  if (take === 3) return { type: "bold_italic", children };
  let node: InlineNode =
    take % 2 === 1
      ? { type: "italic", children }
      : wrapEmphasis(marker, 2, children);
  for (let pairs = Math.floor(take / 2) - (take % 2 === 1 ? 0 : 1); pairs > 0; pairs -= 1) {
    node = wrapEmphasis(marker, 2, [node]);
  }
  return node;
}

interface EmphasisSegment {
  content: string;
  take: number;
}

/** Skip a balanced backtick code span during the closer scan (code binds tighter). */
function skipCodeSpan(text: string, cursor: number): number {
  const ticks = runLengthAt(text, cursor, "`");
  const close = text.indexOf("`".repeat(ticks), cursor + ticks);
  return close === -1 ? cursor + ticks : close + ticks;
}

function matchStackedEmphasis(
  text: string,
  pos: number,
  parseInline: InlineParser,
): InlineMatchResult | null {
  const markerCode = text.charCodeAt(pos);
  const marker = text[pos] as StackingMarker;
  const isStar = markerCode === 42;
  if (pos > 0 && text.charCodeAt(pos - 1) === markerCode) return null; // run interior
  const openLen = runLengthAtCode(text, pos, markerCode);
  const length = text.length;
  if (pos + openLen >= length) return null;
  if (isWhitespaceCode(text.charCodeAt(pos + openLen))) return null; // opener can't precede space
  if (!isStar && pos > 0 && isWordCode(text.charCodeAt(pos - 1))) return null; // no intraword _

  const segments: EmphasisSegment[] = [];
  let remaining = openLen;
  let segStart = pos + openLen;
  let cursor = segStart;
  let matchEnd = -1;
  let depth = 0;

  while (cursor < length && remaining > 0) {
    const code = text.charCodeAt(cursor);
    if (code === CODE_BACKSLASH) {
      cursor += 2;
      continue;
    }
    if (code === CODE_BACKTICK) {
      cursor = skipCodeSpan(text, cursor);
      continue;
    }
    if (code !== markerCode) {
      cursor += 1;
      continue;
    }

    const runLen = runLengthAtCode(text, cursor, markerCode);
    const before = text.charCodeAt(cursor - 1);
    const after = text.charCodeAt(cursor + runLen); // NaN past the end
    const canClose = !isWhitespaceCode(before) && (isStar || !isWordCode(after));
    const canOpen = !isBoundaryCode(after) && (isStar || !isWordCode(before));

    if (canClose && cursor > segStart && depth > 0) {
      depth -= 1; // pairs with an inner opener; stays in the content
      cursor += runLen;
      continue;
    }
    if (canClose && cursor > segStart) {
      const take = remaining < runLen ? remaining : runLen;
      segments.push({ content: text.slice(segStart, cursor), take });
      remaining -= take;
      cursor += take; // surplus closer marks stay in the stream
      matchEnd = cursor;
      segStart = cursor;
      continue;
    }
    if (canOpen) depth += 1;
    cursor += runLen;
  }

  if (segments.length === 0 || segments[0].content.length === 0) return null;

  let node: InlineNode | null = null;
  let consumed = 0;
  for (const segment of segments) {
    const children = node
      ? [node, ...parseInline(segment.content)]
      : parseInline(segment.content);
    node = wrapEmphasis(marker, segment.take, children);
    consumed += segment.take;
  }

  // Surplus opener marks stay OUTSIDE as literal text via the start offset.
  return { start: pos + (openLen - consumed), end: matchEnd, node };
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
      // CommonMark: any ASCII punctuation character can be backslash-escaped.
      if (ESCAPABLE_PUNCTUATION.test(next)) {
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
    defineMatcher(["!"], matchReferenceImage),
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
    // One `[` matcher, dispatched on the SECOND char so a bracket tries only
    // the 1-2 tag forms it could possibly be (was: 12 matchers probed in turn).
    // Priority is unchanged: tag forms → [[page:]] → [text](url) → [^fn] → ref.
    defineMatcher(["["], (text, pos) => {
      const second = text.charCodeAt(pos + 1);
      let tagged: InlineMatchResult | null = null;
      switch (second) {
        case 99: // c → [color=…] / [code]
          tagged =
            matchTaggedInlineColor(text, pos, "color", parseInline, makeTextColor) ??
            matchTaggedInlineChildren(text, pos, "code", parseInline, makeCodeRich);
          break;
        case 98: // b → [bg=…] / [b]
          tagged =
            matchTaggedInlineColor(text, pos, "bg", parseInline, makeBackgroundColor) ??
            matchTaggedInlineChildren(text, pos, "b", parseInline, makeBold);
          break;
        case 105: // i
          tagged = matchTaggedInlineChildren(text, pos, "i", parseInline, makeItalic);
          break;
        case 115: // s
          tagged = matchTaggedInlineChildren(text, pos, "s", parseInline, makeStrikethrough);
          break;
        case 117: // u
          tagged = matchTaggedInlineChildren(text, pos, "u", parseInline, makeUnderline);
          break;
        case 109: // m → [mark]
          tagged = matchTaggedInlineChildren(text, pos, "mark", parseInline, makeHighlight);
          break;
        case 91: // [ → [[page:id]]
          tagged = matchPageLink(text, pos);
          break;
        default:
          break;
      }
      return (
        tagged ??
        matchStandardLink(text, pos, parseInline) ??
        matchFootnoteRef(text, pos) ??
        matchReferenceLink(text, pos, parseInline)
      );
    }),
    defineMatcher([":"], (text, pos) => {
      if (text[pos] !== ":") return null;
      const match = execSticky(EMOJI_STICKY, text, pos);
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
      matchStackedEmphasis(text, pos, parseInline),
    ),
    defineMatcher(["~"], (text, pos) =>
      matchDelimited(text, pos, "~~", "~~", parseInline, (children) => ({
        type: "strikethrough",
        children,
      })) ?? matchTightDelimited(text, pos, "~", parseInline, (children) => ({
        type: "subscript",
        children,
      })),
    ),
    defineMatcher(["^"], (text, pos) =>
      matchTightDelimited(text, pos, "^", parseInline, (children) => ({
        type: "superscript",
        children,
      })),
    ),
    defineMatcher(["|"], (text, pos) =>
      matchDelimited(text, pos, "||", "||", parseInline, (children) => ({
        type: "spoiler",
        children,
      })),
    ),
    defineMatcher(["<"], matchInlineComment),
    defineMatcher(["<"], (text, pos) => {
      const br = /^<br\s*\/?>/i.exec(text.slice(pos, pos + 8));
      if (!br) return null;
      return {
        start: pos,
        end: pos + br[0].length,
        node: { type: "line_break" },
      };
    }),
    defineMatcher(["<"], (text, pos) => matchInlineHtmlTag(text, pos, parseInline)),
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
