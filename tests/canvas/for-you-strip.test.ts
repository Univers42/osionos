/**
 * What the "For you" strip draws when the recommender cannot personalise (C48):
 * the popular order, labelled as such, and no refusal for a user who opted out.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { ForYou, ForYouItem } from "@/features/recs/api/forYou";
import { stripView } from "@/features/recs/model/stripView";
import { whyText } from "@/features/recs/model/whyText";

const item = (pageId: string, why: ForYouItem["why"]): ForYouItem => ({
  pageId,
  title: "A page",
  icon: null,
  workspaceId: "ws",
  rank: 1,
  why,
});

const personal: ForYou = {
  ok: true,
  personalized: true,
  slate: "s1",
  items: [item("p1", { kind: "for_you" })],
};

test("a personalised slate is 'For you', and a page can be refused", () => {
  const view = stripView(personal);
  assert.equal(view?.heading, "For you");
  assert.equal(view?.canRefuse, true);
  assert.equal(view?.items.length, 1);
});

test("the popular order is drawn, labelled 'Popular', for no_model and cold_start", () => {
  for (const reason of ["no_model", "cold_start"]) {
    const view = stripView({
      ok: true,
      personalized: false,
      reason,
      slate: "s2",
      items: [item("p1", { kind: "popular" })],
    });
    assert.equal(view?.heading, "Popular", reason);
    assert.equal(view?.canRefuse, true, reason);
    assert.equal(view?.slate, "s2", reason);
  }
});

test("an opted-out user sees the popular order and cannot refuse a page", () => {
  const view = stripView({
    ok: true,
    personalized: false,
    reason: "opted_out",
    slate: "s3",
    items: [item("p1", { kind: "popular" })],
  });
  assert.equal(view?.heading, "Popular");
  assert.equal(view?.canRefuse, false);
});

test("no item draws nothing, personalised or not", () => {
  assert.equal(stripView({ ok: true, personalized: false, reason: "opted_out", items: [] }), null);
  assert.equal(stripView({ ...personal, items: [] }), null);
});

test("a popular card reads 'Popular with readers'", () => {
  assert.equal(whyText({ kind: "popular" }), "Popular with readers");
});
