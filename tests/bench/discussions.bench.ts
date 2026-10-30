/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   discussions.bench.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  applySuggestion,
  rebaseSuggestion,
  suggestionsOverlap,
  type SuggestionAnchor,
} from "../../src/features/comments/model/suggestionAnchor.ts";
import { threads, type DiscussionRow } from "../../src/features/comments/model/threads.ts";
import { defineBench } from "./harness.ts";

// #228 spec S12: the model work behind every discussion click stays under 2 ms p95,
// so the 20 ms input-to-paint budget is left to React and the browser.
//
// Caveat: synthetic rows, a single-threaded run without React; render and paint are
// measured by tests/e2e/perf/discussions.spec.mjs, not here.

const TWO_MS = 2_000_000;
const WORDS = Array.from({ length: 200 }, (_, n) => `w${n % 10}${"😀é"[n % 2]}`);
const SOURCE = WORDS.join(" ");

/** The anchor of word n in SOURCE, in code points. */
function wordAnchor(n: number): SuggestionAnchor {
  const chars = [...SOURCE];
  let start = 0;
  for (let k = 0; k < n; k += 1) start += [...WORDS[k]].length + 1;
  const end = start + [...WORDS[n]].length;
  return {
    start,
    end,
    quote: chars.slice(start, end).join(""),
    prefix: chars.slice(Math.max(0, start - 16), start).join(""),
    suffix: chars.slice(end, end + 16).join(""),
  };
}

function row(id: number, extra: Partial<DiscussionRow>): DiscussionRow {
  return {
    id: `c${id}`,
    pageId: "p",
    blockId: `b${id % 40}`,
    authorId: `u${id % 7}`,
    content: `comment ${id}`,
    resolvedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 30, 0, 0, 0, id)).toISOString(),
    reactions: id % 3 ? [{ emoji: "👍", count: id % 5, mine: false }] : [],
    ...extra,
  };
}

/** 300 comments, 200 open proposals (overlapping in pairs), 500 replies: 1000 rows, shuffled. */
function pageRows(oneBlock: boolean): DiscussionRow[] {
  const rows: DiscussionRow[] = [];
  for (let n = 0; n < 300; n += 1) rows.push(row(n, {}));
  for (let n = 300; n < 500; n += 1) {
    rows.push(row(n, {
      kind: "suggestion",
      status: "open",
      blockId: oneBlock ? "b0" : `b${n % 40}`,
      anchor: wordAnchor((n * 7) % 199),
      suggestion: { insert: "x" },
    }));
  }
  for (let n = 500; n < 1000; n += 1) rows.push(row(n, { parentId: `c${n % 500}` }));
  return rows.sort((a, b) => (a.id.length * 7 + a.id.charCodeAt(a.id.length - 1)) % 11 - (b.id.length * 7 + b.id.charCodeAt(b.id.length - 1)) % 11);
}

const OPEN = Array.from({ length: 200 }, (_, n) => wordAnchor(n % 199));
const ACCEPTED = { anchor: wordAnchor(100), insert: "replaced words" };
const NEXT_SOURCE = applySuggestion(SOURCE, ACCEPTED);

export const bench = defineBench("discussions model (#228)", [
  {
    name: "threads() over 1000 rows, proposals on 40 blocks",
    budgetNs: TWO_MS,
    setup: () => {
      const rows = pageRows(false);
      return () => threads(rows).length;
    },
  },
  {
    name: "threads() over 1000 rows, 200 proposals on one block",
    budgetNs: TWO_MS,
    setup: () => {
      const rows = pageRows(true);
      return () => threads(rows).length;
    },
  },
  {
    name: "overlap of one proposal against 200 open ones",
    budgetNs: TWO_MS,
    setup: () => () => OPEN.filter((anchor) => suggestionsOverlap(anchor, ACCEPTED.anchor)).length,
  },
  {
    name: "rebase 200 open proposals after an accept",
    budgetNs: TWO_MS,
    setup: () => () => OPEN.map((anchor) => rebaseSuggestion(anchor, ACCEPTED, NEXT_SOURCE)).length,
  },
]);
