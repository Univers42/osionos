/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-stamp-cover.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// groot ADR 0064 PS26 (F7): the stamp names a cover height or width only when the page has one.
// Every page without them keeps its stamp byte for byte, so no outbox ledger entry recorded
// before the reader shipped turns stale and no page republishes on upgrade.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PageEntry } from "@/entities/page";
import { pageStamp } from "@/store/sync/pageStamp";
import { STAMP_CORPUS } from "./page-stamp-cover-fixtures.ts";

// Recorded on origin/develop 50406aa92, before the cover fields existed.
const LEGACY_STAMPS = [
  "|Page||ws-1|private|||3hntv|0|0|yj2w2m|∅",
  "2026-10-01T10:00:00.000Z|||ws-1|private|||3hntv|0|0|yj2w2m|3hntv",
  "|Page||ws-1|private|📄|linear-gradient(red, blue)|3hntv|0|0|yj2w2m|∅",
  "|Page||ws-1|public||https://example.test/c.png|3hntv|0|0|yj2w2m|∅",
  "|Page|507f1f77bcf86cd799439011|ws-1|private|||3hntv|0|0|yj2w2m|∅",
  "|Page||ws-1|private|||1649n1c|0|0|yj2w2m|∅",
  "|Page||ws-1|private|||3hntv|1|1|lchp4|∅",
  "|Page||ws-1|private|||3hntv|0|0|yj2w2m|12h13mu",
  "|Page||ws-1|private|||3hntv|0|0|yj2w2m|puxnpi",
];

test("PS26: a page without a cover height or width keeps its legacy stamp byte for byte", () => {
  assert.deepEqual(STAMP_CORPUS.map(pageStamp), LEGACY_STAMPS);
});

test("PS26: an explicitly undefined height or width stamps like an absent one", () => {
  for (const page of STAMP_CORPUS) {
    assert.equal(pageStamp({ ...page, coverHeight: undefined, coverWidth: undefined }), pageStamp(page));
  }
});

test("PS26: a cover height or width changes the stamp, each on its own", () => {
  const page: PageEntry = STAMP_CORPUS[0];
  const stamps = new Set([
    pageStamp(page),
    pageStamp({ ...page, coverHeight: 320 }),
    pageStamp({ ...page, coverHeight: 321 }),
    pageStamp({ ...page, coverWidth: "full" }),
    pageStamp({ ...page, coverWidth: "content" }),
    pageStamp({ ...page, coverHeight: 320, coverWidth: "full" }),
  ]);
  assert.equal(stamps.size, 6);
});

// A ledger entry recorded before this change never folded coverPosition; folding it now would
// mark every repositioned page unpublished and re-PATCH it once (the outbox stays unwidened).
test("coverPosition stays out of the stamp", () => {
  const page = STAMP_CORPUS[2];
  assert.equal(pageStamp({ ...page, coverPosition: 99 }), pageStamp(page));
});
