/**
 * Where a suggested edit lands in a block's inline SOURCE (#228). The editor hands plain
 * text offsets (`getInlineEditorOffsetsForRange`); the server splices source. This maps
 * one to the other through the engine's own serializer, and checks the result before a
 * suggestion is sent: a splice that would change the visible text in any way other than
 * the one the user typed is widened, and refused if even the whole block can't hold it.
 *
 * Offsets in an anchor are CODE POINTS (spec C4): Postgres `substr`/`position` count
 * them, so the SQL decide applies the same rules (`reanchorSuggestion`, `rebaseSuggestion`)
 * over the shared fixture `tests/fixtures/suggestion-anchors.json`.
 *
 * Caveat: typed text is taken as source. Text that reads as markup (`[b]x[/b]`, a
 * backtick) changes what is shown, fails the check and is refused instead of escaped —
 * the engine has no escaper. A block whose stored source is not the engine's canonical
 * form (`[color=red]`, a lowercase hex) is refused whole. A re-anchor finds the unique `prefix + quote + suffix`; a
 * quote whose context was edited, or repeated with the same context, goes stale.
 */

import type { InlineNode } from "@osionos/markdown-engine";
import { cloneWrapperNode, hasInlineChildren, serializeInlineNodes } from "@osionos/markdown-engine/inlineAst";
import { applyInlineTextEdit } from "@osionos/markdown-engine/inlineTextEditing";
import { parseInline } from "@osionos/markdown-engine/markdown/parser";

const CONTEXT_CODE_POINTS = 16;
const PROBE = "\uE000";

export interface SuggestionAnchor {
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface SuggestionDraft {
  anchor: SuggestionAnchor;
  insert: string;
}

interface OffsetMap {
  plain: string;
  /** Source index where plain position p begins, inside the formatting that follows it. */
  startAt: number[];
  /** Source index where plain position p ends, inside the formatting that precedes it. */
  endAt: number[];
  /** Top-level node source ranges, in order. */
  topLevel: Array<[number, number]>;
  /** Plain positions strictly inside an atomic node (a mention, an equation). */
  insideAtomic: Set<number>;
}

/** The plain text an atomic node counts as, the same length the engine's editing gives it. */
function atomicPlain(node: InlineNode): string | null {
  switch (node.type) {
    case "emoji":
    case "math_inline":
      return node.value;
    case "footnote_ref":
      return `[${node.label}]`;
    case "internal_link":
      return `[[page:${node.pageId}]]`;
    case "variable":
      return `{{${node.expr}}}`;
    case "line_break":
      return "\n";
    case "image":
      return "";
    default:
      return null;
  }
}

function mapNodes(nodes: InlineNode[], base: number, map: OffsetMap, topLevel: boolean): void {
  let at = base;
  for (const node of nodes) {
    const serialized = serializeInlineNodes([node]);
    if (topLevel) map.topLevel.push([at, at + serialized.length]);
    if (node.type === "text" || node.type === "code") {
      mapRun(node.value, at + (node.type === "code" ? 1 : 0), map);
    } else if (hasInlineChildren(node)) {
      const open = serializeInlineNodes([cloneWrapperNode(node, [{ type: "text", value: PROBE }])]).indexOf(PROBE);
      mapNodes(node.children, at + open, map, false);
    } else {
      mapAtomic(atomicPlain(node) ?? "", at, at + serialized.length, map);
    }
    at += serialized.length;
  }
}

function mapRun(value: string, at: number, map: OffsetMap): void {
  const p = map.plain.length;
  for (let i = 0; i <= value.length; i += 1) {
    if (i < value.length) map.startAt[p + i] = at + i;
    if (i > 0) map.endAt[p + i] = at + i;
  }
  map.plain += value;
}

/** An atomic node is all or nothing: a position inside it snaps outward. */
function mapAtomic(plain: string, from: number, to: number, map: OffsetMap): void {
  const p = map.plain.length;
  for (let i = 0; i <= plain.length; i += 1) {
    if (i < plain.length) map.startAt[p + i] = from;
    if (i > 0) map.endAt[p + i] = to;
    if (i > 0 && i < plain.length) map.insideAtomic.add(p + i);
  }
  map.plain += plain;
}

function offsetMap(nodes: InlineNode[], source: string): OffsetMap {
  const map: OffsetMap = { plain: "", startAt: [], endAt: [], topLevel: [], insideAtomic: new Set() };
  mapNodes(nodes, 0, map, true);
  map.startAt[map.plain.length] ??= source.length;
  map.endAt[0] ??= 0;
  return map;
}

/** The text a block source shows, or null when the engine can't round-trip the source. */
export function visibleText(source: string): string | null {
  const nodes = parseInline(source);
  return serializeInlineNodes(nodes) === source ? offsetMap(nodes, source).plain : null;
}

/** The UTF-16 index `count` code points after `index`, clamped to the end. */
function stepForward(text: string, index: number, count: number): number {
  let at = index;
  for (let left = count; left > 0 && at < text.length; left -= 1) at += text.codePointAt(at)! > 0xffff ? 2 : 1;
  return at;
}

/** The UTF-16 index `count` code points before `index`, clamped to 0. */
function stepBack(text: string, index: number, count: number): number {
  let at = index;
  for (let left = count; left > 0 && at > 0; left -= 1) {
    at -= at >= 2 && text.codePointAt(at - 2)! > 0xffff ? 2 : 1;
  }
  return at;
}

function codePointsBetween(text: string, from: number, to: number): number {
  let count = 0;
  for (let at = from; at < to; at += text.codePointAt(at)! > 0xffff ? 2 : 1) count += 1;
  return count;
}

const codePoints = (text: string): number => codePointsBetween(text, 0, text.length);

const splitsSurrogatePair = (text: string, at: number): boolean =>
  at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at]);

// Walked over the UTF-16 string, never spread into an array: rebasing 200 open
// proposals spread the block 4 times each: 3.44 ms p95, 0.58 ms walked
// (tests/bench/discussions.bench.ts, Docker, 2026-10-30).
function utf16At(source: string, codePoint: number): number {
  return stepForward(source, 0, codePoint);
}

function anchorAt(source: string, start: number, end: number): SuggestionAnchor {
  const from = codePointsBetween(source, 0, start);
  return {
    start: from,
    end: from + codePointsBetween(source, start, end),
    quote: source.slice(start, end),
    prefix: source.slice(stepBack(source, start, CONTEXT_CODE_POINTS), start),
    suffix: source.slice(end, stepForward(source, end, CONTEXT_CODE_POINTS)),
  };
}

/** True when splicing `insert` over source[start,end) shows exactly `expected`. */
function splices(source: string, start: number, end: number, insert: string, expected: string): boolean {
  return visibleText(source.slice(0, start) + insert + source.slice(end)) === expected;
}

/** The source the engine's own text edit produces, the reference every candidate must match. */
function editedSource(source: string, plainStart: number, plainEnd: number, typed: string): string {
  const selection = { start: plainStart, end: plainEnd };
  const command = typed ? { type: "insert_text" as const, text: typed } : { type: "delete_backward" as const };
  return applyInlineTextEdit(source, selection, command).source;
}

/** Widens [start,end) to whole top-level nodes, then to the whole block, taking the insert from the edited source. */
function widened(source: string, edited: string, map: OffsetMap, tight: [number, number]): Array<[number, number, string]> {
  const nodeStart = map.topLevel.find(([from, to]) => tight[0] >= from && tight[0] < to)?.[0] ?? tight[0];
  const nodeEnd = [...map.topLevel].reverse().find(([from, to]) => tight[1] > from && tight[1] <= to)?.[1] ?? tight[1];
  const candidates: Array<[number, number, string]> = [];
  const tail = source.length - nodeEnd;
  if (edited.startsWith(source.slice(0, nodeStart)) && edited.endsWith(source.slice(nodeEnd)) && edited.length >= nodeStart + tail) {
    candidates.push([nodeStart, nodeEnd, edited.slice(nodeStart, edited.length - tail)]);
  }
  candidates.push([0, source.length, edited]);
  return candidates;
}

/**
 * The anchor and insert for replacing plain [plainStart, plainEnd) (UTF-16, as the DOM
 * reports them) with `typed`. Null when the block's source can't carry the edit: the
 * composer refuses to send rather than send a splice that shows something else (C3).
 */
export function draftSuggestion(source: string, plainStart: number, plainEnd: number, typed: string): SuggestionDraft | null {
  const nodes = parseInline(source);
  if (serializeInlineNodes(nodes) !== source) return null;
  const map = offsetMap(nodes, source);
  if (plainStart < 0 || plainEnd < plainStart || plainEnd > map.plain.length) return null;
  if (plainStart === plainEnd && !typed) return null;
  for (const at of [plainStart, plainEnd]) {
    if (splitsSurrogatePair(map.plain, at) || map.insideAtomic.has(at)) return null;
  }
  const expected = map.plain.slice(0, plainStart) + typed + map.plain.slice(plainEnd);
  const caret = plainStart > 0 ? map.endAt[plainStart] : map.startAt[0];
  const tight: [number, number] = plainStart === plainEnd ? [caret, caret] : [map.startAt[plainStart], map.endAt[plainEnd]];
  const candidates: Array<[number, number, string]> = [[tight[0], tight[1], typed]];
  candidates.push(...widened(source, editedSource(source, plainStart, plainEnd, typed), map, tight));
  for (const [start, end, insert] of candidates) {
    if (start <= end && splices(source, start, end, insert, expected)) return { anchor: anchorAt(source, start, end), insert };
  }
  return null;
}

/** The plain range an anchor covers, for the highlight; null when the quote is not at its offsets. */
export function plainRangeForAnchor(source: string, anchor: SuggestionAnchor): { start: number; end: number } | null {
  const start = utf16At(source, anchor.start);
  const end = utf16At(source, anchor.end);
  if (source.slice(start, end) !== anchor.quote) return null;
  const nodes = parseInline(source);
  if (serializeInlineNodes(nodes) !== source) return null;
  const map = offsetMap(nodes, source);
  let plainStart = 0;
  while (plainStart < map.plain.length && map.startAt[plainStart] < start) plainStart += 1;
  let plainEnd = map.plain.length;
  while (plainEnd > plainStart && map.endAt[plainEnd] > end) plainEnd -= 1;
  return { start: plainStart, end: plainEnd };
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) found.push(at);
  return found;
}

/**
 * The anchor in the block's current source: where it was if `prefix + quote + suffix`
 * still reads there, else the unique place it reads, else null (stale). An insertion
 * with no context is always stale (C2): an offset alone is not a place.
 */
export function reanchorSuggestion(source: string, anchor: SuggestionAnchor): SuggestionAnchor | null {
  const context = anchor.prefix + anchor.quote + anchor.suffix;
  if (!context) return null;
  const chars = [...source];
  const contextStart = anchor.start - codePoints(anchor.prefix);
  if (contextStart >= 0 && chars.slice(contextStart, contextStart + codePoints(context)).join("") === context) return anchor;
  const found = occurrences(source, context);
  if (found.length !== 1) return null;
  const start = codePoints(source.slice(0, found[0])) + codePoints(anchor.prefix);
  return { ...anchor, start, end: start + codePoints(anchor.quote) };
}

/** Two anchors touch the same text; an insertion overlaps a range it sits inside or on the edge of. */
export function suggestionsOverlap(left: SuggestionAnchor, right: SuggestionAnchor): boolean {
  if (left.start === left.end || right.start === right.end) {
    return left.start <= right.end && right.start <= left.end;
  }
  return left.start < right.end && right.start < left.end;
}

/**
 * Another open suggestion after `accepted` was spliced into the block, `nextSource` being
 * the block's new source: shifted past the splice with fresh context, or null when it
 * overlaps the accepted one and is superseded.
 */
export function rebaseSuggestion(
  other: SuggestionAnchor,
  accepted: SuggestionDraft,
  nextSource: string,
): SuggestionAnchor | null {
  if (suggestionsOverlap(other, accepted.anchor)) return null;
  const delta = other.start >= accepted.anchor.end
    ? codePoints(accepted.insert) - (accepted.anchor.end - accepted.anchor.start)
    : 0;
  const start = utf16At(nextSource, other.start + delta);
  return anchorAt(nextSource, start, start + other.quote.length);
}

/** Applies an anchor's insert to the block source it was drafted against. */
export function applySuggestion(source: string, draft: SuggestionDraft): string {
  const chars = [...source];
  return chars.slice(0, draft.anchor.start).join("") + draft.insert + chars.slice(draft.anchor.end).join("");
}
