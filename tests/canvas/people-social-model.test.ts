/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   people-social-model.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * P2-3-b: the rules behind the follow button, the status editor and the presence badge.
 * The model is pure, so nothing is stubbed except the two requests the toggle makes.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  STATUS_EMOJI_LIMIT,
  STATUS_TEXT_LIMIT,
  checkPresenceText,
  optimisticFollow,
  presenceLabel,
  toggleFollow,
  validateStatus,
  type FollowView,
  type StatusDraft,
} from "../../src/features/settings/people/peopleSocialModel.ts";

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const NOT_FOLLOWING: FollowView = { following: false, followerCount: 4, followingCount: 2 };
const FOLLOWING: FollowView = { following: true, followerCount: 5, followingCount: 2 };

const draft = (over: Partial<StatusDraft> = {}): StatusDraft => ({ emoji: "", text: "", expiresAt: "", busy: false, ...over });

function calls(fail: "follow" | "unfollow" | null = null) {
  const seen: string[] = [];
  return {
    seen,
    api: {
      follow: async () => { seen.push("follow"); if (fail === "follow") throw new Error("403"); },
      unfollow: async () => { seen.push("unfollow"); if (fail === "unfollow") throw new Error("500"); },
    },
  };
}

// --- follow -------------------------------------------------------------------

test("optimisticFollow: following adds one follower, unfollowing removes one", () => {
  assert.deepEqual(optimisticFollow(NOT_FOLLOWING), FOLLOWING);
  assert.deepEqual(optimisticFollow(FOLLOWING), NOT_FOLLOWING);
});

test("optimisticFollow: the follower count never goes below zero", () => {
  assert.equal(optimisticFollow({ following: true, followerCount: 0, followingCount: 0 }).followerCount, 0);
});

test("toggleFollow: the flipped view is shown before the request settles", async () => {
  const shown: FollowView[] = [];
  const { api, seen } = calls();
  const outcome = await toggleFollow(NOT_FOLLOWING, api, (next) => shown.push(next));
  assert.deepEqual(shown, [FOLLOWING]);
  assert.deepEqual(seen, ["follow"]);
  assert.deepEqual(outcome, { view: FOLLOWING, failed: false });
});

test("toggleFollow: an unfollow calls unfollow, not follow", async () => {
  const { api, seen } = calls();
  await toggleFollow(FOLLOWING, api, () => undefined);
  assert.deepEqual(seen, ["unfollow"]);
});

test("toggleFollow: a refused follow rolls the view back", async () => {
  const shown: FollowView[] = [];
  const outcome = await toggleFollow(NOT_FOLLOWING, calls("follow").api, (next) => shown.push(next));
  assert.deepEqual(shown, [FOLLOWING, NOT_FOLLOWING]);
  assert.deepEqual(outcome, { view: NOT_FOLLOWING, failed: true });
});

test("toggleFollow: a refused unfollow keeps the person followed", async () => {
  const shown: FollowView[] = [];
  const outcome = await toggleFollow(FOLLOWING, calls("unfollow").api, (next) => shown.push(next));
  assert.deepEqual(shown, [NOT_FOLLOWING, FOLLOWING]);
  assert.equal(outcome.failed, true);
});

// --- status -------------------------------------------------------------------

test("validateStatus: an empty draft clears every field", () => {
  assert.deepEqual(validateStatus(draft(), NOW), { ok: true, body: { emoji: null, text: null, expiresAt: null, busy: false } });
});

test("validateStatus: text is trimmed and control characters are dropped", () => {
  const result = validateStatus(draft({ text: "  in\u0007 a meeting \n", emoji: "🎯" }), NOW);
  assert.deepEqual(result.ok && result.body, { emoji: "🎯", text: "in a meeting", expiresAt: null, busy: false });
});

test("validateStatus: the text limit is inclusive", () => {
  assert.equal(validateStatus(draft({ text: "a".repeat(STATUS_TEXT_LIMIT) }), NOW).ok, true);
  const over = validateStatus(draft({ text: "a".repeat(STATUS_TEXT_LIMIT + 1) }), NOW);
  assert.equal(over.ok, false);
  assert.equal(!over.ok && over.field, "text");
});

test("validateStatus: the emoji limit is inclusive and counts characters, not UTF-16 units", () => {
  assert.equal(validateStatus(draft({ emoji: "😀".repeat(STATUS_EMOJI_LIMIT) }), NOW).ok, true);
  const over = validateStatus(draft({ emoji: "😀".repeat(STATUS_EMOJI_LIMIT + 1) }), NOW);
  assert.equal(!over.ok && over.field, "emoji");
});

test("validateStatus: an expiry in the past or not a date is refused, a future one is kept as ISO", () => {
  assert.equal(!validateStatus(draft({ expiresAt: "2026-10-23T11:59:59.000Z" }), NOW).ok, true);
  assert.equal(!validateStatus(draft({ expiresAt: "tomorrow-ish" }), NOW).ok, true);
  const future = validateStatus(draft({ text: "out", expiresAt: "2026-10-23T13:00:00Z" }), NOW);
  assert.equal(future.ok && future.body.expiresAt, "2026-10-23T13:00:00.000Z");
});

test("validateStatus: busy is carried on its own", () => {
  const result = validateStatus(draft({ busy: true }), NOW);
  assert.equal(result.ok && result.body.busy, true);
});

test("checkPresenceText: empty clears, the limit is inclusive", () => {
  assert.deepEqual(checkPresenceText("   "), { ok: true, text: null });
  assert.equal(checkPresenceText("x".repeat(120)).ok, true);
  assert.equal(checkPresenceText("x".repeat(121)).ok, false);
});

// --- presence -----------------------------------------------------------------

test("presenceLabel: every state has its own words, and invisible is never online", () => {
  assert.deepEqual(
    ["online", "away", "dnd", "invisible", "offline"].map(presenceLabel),
    ["Online", "Away", "Do not disturb", "Invisible", "Offline"],
  );
  assert.notEqual(presenceLabel("invisible"), presenceLabel("online"));
});

test("presenceLabel: an unknown or missing state reads as offline", () => {
  assert.equal(presenceLabel("sleeping"), "Offline");
  assert.equal(presenceLabel(undefined), "Offline");
});
