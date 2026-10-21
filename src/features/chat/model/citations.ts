/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   citations.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sources of an answer — the pages the assistant read.
 *
 * The service sends one `citation` frame per source, BEFORE the first
 * `text.delta`, and the answer cites them as `[n]`. The same sources come back
 * with the stored message, as `citation` parts in the same order.
 *
 * Two rules hold everywhere in this file:
 *
 * - A TITLE AND A SNIPPET ARE PLAIN TEXT. They come from workspace pages, so
 *   they can carry anything a page holds. They are never markdown, never HTML.
 * - A `[n]` INSIDE CODE IS NOT A MARKER. Code spans and fenced blocks are
 *   shown as they were written: `` `[1]` `` stays `` `[1]` ``.
 *
 * Pure logic, no React: the rendering lives in citedAnswer.ts.
 */

import type { ChatMessagePart } from "./chatTypes";

import { codeRegions } from "./markdownCode";

/** One source of an answer: the page — and the block — it points at. */
export interface Citation {
  /** The number the answer cites this source by: `[n]`. */
  n: number;
  /** The page the source is in. */
  pageId: string;
  /** The block inside the page, when the source is one block. */
  blockId?: string;
  /** The title of the page — plain text. */
  title: string;
  /** The snippet the answer drew on — plain text. */
  snippet: string;
}

/** A piece of an answer: plain text, or a marker of a source. */
export type AnswerSegment =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "cite"; n: number; text: string; start: number; end: number };

/* -------------------------------------------------------------------------- */
/* Reading the sources                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A source out of a `citation` frame. A frame that does not carry a number and
 * a page is not a source: it is dropped, and the answer shows no marker for it.
 */
export function citationFromEvent(data: Record<string, unknown>): Citation | null {
  const n = typeof data.n === "number" && Number.isInteger(data.n) && data.n > 0 ? data.n : null;
  const pageId = typeof data.pageId === "string" ? data.pageId : "";
  if (n === null || !pageId) return null;
  const blockId = typeof data.blockId === "string" && data.blockId ? data.blockId : undefined;
  return {
    n,
    pageId,
    ...(blockId ? { blockId } : {}),
    title: typeof data.title === "string" ? data.title : "",
    snippet: typeof data.snippet === "string" ? data.snippet : "",
  };
}

/**
 * The sources of a STORED message: its `citation` parts, in order.
 *
 * The number of a source is its rank among the citation parts (1, 2, 3…), so
 * the markers of a loaded answer line up with the markers of the answer that
 * was streamed — the frames and the stored parts are the same list.
 */
export function citationsFromParts(parts: ChatMessagePart[] | undefined): Citation[] {
  if (!parts) return [];
  const citations: Citation[] = [];
  for (const part of parts) {
    if (!part || part.type !== "citation") continue;
    citations.push({
      n: citations.length + 1,
      pageId: part.pageId,
      ...(part.blockId ? { blockId: part.blockId } : {}),
      title: part.title,
      snippet: part.snippet,
    });
  }
  return citations;
}

/**
 * The answer, cut into pieces: plain text, and the markers of its sources.
 *
 * A `[n]` becomes a marker only when the answer HAS that source: a `[3]` with
 * no third source stays the text it was. A `[n]` inside code stays literal.
 *
 * The offsets are the marker's place in the answer, so a renderer can put a
 * button exactly where the marker was written.
 */
export function segmentAnswer(text: string, citations: Citation[]): AnswerSegment[] {
  if (!text) return [];
  const known = new Set(citations.map((citation) => citation.n));
  if (known.size === 0) return [{ kind: "text", text, start: 0, end: text.length }];

  const code = codeRegions(text);
  const segments: AnswerSegment[] = [];
  const pattern = /\[(\d{1,4})\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (code.some(([from, to]) => start >= from && start < to)) continue;
    const n = Number(match[1]);
    if (!known.has(n)) continue;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start), start: last, end: start });
    segments.push({ kind: "cite", n, text: match[0], start, end });
    last = end;
  }
  if (last < text.length) {
    segments.push({ kind: "text", text: text.slice(last), start: last, end: text.length });
  }
  return segments;
}
