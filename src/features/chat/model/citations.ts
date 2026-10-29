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
 * - A TITLE AND A SNIPPET ARE PLAIN TEXT. They come from workspace pages or
 *   from the web, so they can carry anything a page holds; so does a domain. They are never markdown, never HTML.
 * - A `[n]` INSIDE CODE IS NOT A MARKER. Code spans and fenced blocks are
 *   shown as they were written: `` `[1]` `` stays `` `[1]` ``.
 *
 * Pure logic, no React: the rendering lives in citedAnswer.ts.
 */

import type { ChatMessagePart } from "./chatTypes";

import { codeRegions } from "./markdownCode";

/**
 * One source of an answer: a page and the block it points at, a passage of
 * a curated knowledge pack, or a page of the web.
 *
 * The wire omits `collection` for a page (it is the source the client has
 * always read); `citationOf` normalises that absence to `'page'`.
 */
export type Citation =
  | {
      collection: "page";
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
  | {
      collection: "pack";
      /** The number the answer cites this source by: `[n]`. */
      n: number;
      /** The knowledge pack — its slug. */
      pack: string;
      /** The title of the passage — plain text. */
      title: string;
      /** The snippet the answer drew on — plain text. */
      snippet: string;
    }
  | {
      collection: "web";
      /** The number the answer cites this source by: `[n]`. */
      n: number;
      /** The address of the page: always `https:`, opened in a new tab and never in the app. */
      url: string;
      /** The host the page is on — plain text. */
      domain: string;
      /** The title of the page — plain text. */
      title: string;
      /** The snippet the answer drew on — plain text. */
      snippet: string;
    };

/** A piece of an answer: plain text, or a marker of a source. */
export type AnswerSegment =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "cite"; n: number; text: string; start: number; end: number };

/* -------------------------------------------------------------------------- */
/* Reading the sources                                                        */
/* -------------------------------------------------------------------------- */

/** The number a source is cited by: a positive integer, or nothing. */
function citationNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** The slug of a knowledge pack, exactly as the service mints it. */
const PACK_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** The address of a web source: an `https:` URL, or nothing. Anything else is never a link. */
function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * One source out of a record: a `citation` frame, or a stored `citation` part.
 *
 * A page source needs a non-empty string `pageId`; its `collection` is absent
 * on the wire and normalised to `'page'`. A pack source needs
 * `collection === 'pack'` and a `pack` slug. A web source needs
 * `collection === 'web'` and an `https:` `url`: any other scheme drops it.
 * Anything else is not a source: it
 * is dropped here, so both paths drop exactly the same records.
 *
 * `rank` is the number a stored part without an `n` falls back to; an event
 * passes `null`, because a frame without a number is not a source.
 */
export function citationOf(record: Record<string, unknown>, rank: number | null): Citation | null {
  const n = citationNumber(record.n) ?? rank;
  if (n === null) return null;
  const title = typeof record.title === "string" ? record.title : "";
  const snippet = typeof record.snippet === "string" ? record.snippet : "";
  if (record.collection === "pack") {
    const pack = typeof record.pack === "string" ? record.pack : "";
    if (!PACK_SLUG.test(pack)) return null;
    return { collection: "pack", n, pack, title, snippet };
  }
  if (record.collection === "web") {
    const parsed = httpsUrl(record.url);
    if (!parsed) return null;
    // The wire names the domain; a frame that omits it still shows the host it links to.
    const domain = typeof record.domain === "string" && record.domain ? record.domain : parsed.hostname;
    return { collection: "web", n, url: parsed.href, domain, title, snippet };
  }
  if (record.collection !== undefined && record.collection !== "page") return null;
  const pageId = typeof record.pageId === "string" ? record.pageId : "";
  if (!pageId) return null;
  const blockId = typeof record.blockId === "string" && record.blockId ? record.blockId : undefined;
  return {
    collection: "page",
    n,
    pageId,
    ...(blockId ? { blockId } : {}),
    title,
    snippet,
  };
}

/**
 * A source out of a `citation` frame. A frame that does not carry a number and
 * a page, a pack or a web address is not a source: it is dropped, and the answer shows no
 * marker for it.
 */
export function citationFromEvent(data: Record<string, unknown>): Citation | null {
  return citationOf(data, null);
}

/**
 * The sources of a message: its `citation` parts, in the order of their numbers.
 *
 * A part carries the number the service gave it. The searches of one step run
 * side by side, so the frames do not arrive in that order: the number is never
 * the rank of the part. A part stored without a number takes its rank (1, 2, 3…).
 *
 * Caveat: an answer stored before the parts carried numbers, whose searches ran
 * side by side, has its parts in arrival order, so its markers point at the
 * wrong sources; there is no number left to recover them from.
 */
export function citationsFromParts(parts: ChatMessagePart[] | undefined): Citation[] {
  if (!parts) return [];
  const citations: Citation[] = [];
  for (const part of parts) {
    if (!part || part.type !== "citation") continue;
    const citation = citationOf(part, citations.length + 1);
    if (citation) citations.push(citation);
  }
  return citations.sort((left, right) => left.n - right.n);
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
