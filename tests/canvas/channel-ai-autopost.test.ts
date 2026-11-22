/**
 * osio auto-post in an opted-in channel (osio-bot OB1, OB3, OB7), the
 * client half. The asker's client posts the run through the existing post
 * route when the draft is ready (OB1); the asker consents to auto-posting
 * apart from drafting, and the notice says the answer posts without review
 * (OB3); a refused post leaves a private draft with its reason, whose Post
 * re-runs the same guards, and `answer_blocked` never clears (OB7).
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AiDraft } from "@/widgets/channel-messages/model/aiAnswerDraft";
import { AiDraftCard } from "@/widgets/channel-messages/ui/AiDraftCard";

import { CHANNEL, USER, aiDraftWorld, frame } from "./channel-ai-draft-fixtures";

const noop = () => undefined;

function card(draft: AiDraft): string {
  return renderToStaticMarkup(
    React.createElement(AiDraftCard, { draft, onAccept: noop, onPost: noop, onRetry: noop, onDiscard: noop }),
  );
}

/** Whether the card's Post button carries the disabled attribute (its class names "disabled:" variants). */
function postDisabled(markup: string): boolean {
  const button = markup.match(/<button([^>]*)>(Post|Posting…)<\/button>/);
  assert.ok(button, "the card has a Post button");
  return /\sdisabled=""/.test(button[1]);
}

test("OB3: consent to drafts does not cover auto-posting; the autopost notice asks again and sends nothing", async () => {
  const w = aiDraftWorld({ seen: ["draft"] });
  w.ask(true);
  assert.equal(w.draft()?.status, "notice");
  assert.equal(w.draft()?.autopost, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(w.calls.threadRuns, []);
  w.store.getState().accept(CHANNEL);
  await w.settled();
  assert.deepEqual(w.calls.consents, [{ userId: USER, mode: "autopost" }]);
  assert.equal(w.calls.threadRuns.length, 1);
});

test("OB3: consent to auto-posting is remembered apart, and a draft channel still asks its own", async () => {
  const w = aiDraftWorld({ seen: ["autopost"] });
  w.ask(false);
  assert.equal(w.draft()?.status, "notice");
  assert.equal(w.draft()?.autopost, undefined, "a draft-mode draft keeps its shape");
});

test("OB3: the autopost notice says the answer posts to the channel without review", () => {
  const autopost = card({ triggerId: "t", status: "notice", text: "", code: null, autopost: true });
  assert.match(autopost, /posts to the channel without review/);
  assert.doesNotMatch(autopost, /Nothing is posted until you press Post/);
  assert.match(card({ triggerId: "t", status: "notice", text: "", code: null }), /Nothing is posted until you press Post/);
});

test("OB3: an autopost channel shows a lasting \"@ai answers post here\" marker", async () => {
  const marker = (await import("@/widgets/channel-messages/ui/AiAutopostMarker")) as {
    AiAutopostMarker?: React.FC<{ autopost: boolean }>;
  };
  assert.equal(typeof marker.AiAutopostMarker, "function");
  const Marker = marker.AiAutopostMarker as React.FC<{ autopost: boolean }>;
  assert.match(renderToStaticMarkup(React.createElement(Marker, { autopost: true })), /@ai answers post here/);
  assert.equal(renderToStaticMarkup(React.createElement(Marker, { autopost: false })), "");
});

test("OB1: at ready the asker's client posts the run through the existing route, once", async () => {
  const w = aiDraftWorld({ seen: ["autopost"] });
  w.ask(true);
  await w.settled();
  assert.deepEqual(w.calls.posts, [{ channelId: CHANNEL, runId: "run-1" }]);
  assert.equal(w.draft(), undefined, "the draft is gone once posted");
  assert.deepEqual(w.calls.posted.map((message) => message.id), ["posted-1"]);
});

test("OB1: a draft channel never posts by itself", async () => {
  const w = aiDraftWorld({ seen: ["draft"] });
  w.ask(false);
  await w.settled();
  assert.equal(w.draft()?.status, "ready");
  assert.deepEqual(w.calls.posts, []);
});

test("OB1: a run that fails posts nothing", async () => {
  const w = aiDraftWorld({ seen: ["autopost"], frames: [frame("1", "error", { code: "ai_busy" })] });
  w.ask(true);
  await w.settled();
  assert.deepEqual([w.draft()?.status, w.draft()?.code], ["error", "ai_busy"]);
  assert.deepEqual(w.calls.posts, []);
});

test("OB7: a refused auto-post leaves a private draft with its reason, and its Post re-runs the guards", async () => {
  const w = aiDraftWorld({ seen: ["autopost"], postOutcomes: ["context_changed", null] });
  w.ask(true);
  await w.settled();
  const held = w.draft();
  assert.deepEqual([held?.status, held?.code, held?.text], ["held", "context_changed", "Friday it is."]);
  assert.equal(postDisabled(card(held as AiDraft)), false);
  const message = await w.store.getState().post(CHANNEL);
  assert.equal(message?.id, "posted-2");
  assert.deepEqual(w.calls.posts.map((call) => call.runId), ["run-1", "run-1"], "the same run, through the same route");
  assert.equal(w.draft(), undefined);
});

test("OB7: a held draft refused again stays held with the new reason", async () => {
  const w = aiDraftWorld({ seen: ["autopost"], postOutcomes: ["trigger_changed", "access_revoked"] });
  w.ask(true);
  await w.settled();
  assert.equal(await w.store.getState().post(CHANNEL), null);
  assert.deepEqual([w.draft()?.status, w.draft()?.code], ["held", "access_revoked"]);
});

test("OB7: answer_blocked never clears: the held draft cannot be posted", async () => {
  const w = aiDraftWorld({ seen: ["autopost"], postOutcomes: ["answer_blocked"] });
  w.ask(true);
  await w.settled();
  const held = w.draft();
  assert.deepEqual([held?.status, held?.code], ["held", "answer_blocked"]);
  assert.equal(postDisabled(card(held as AiDraft)), true);
  assert.equal(await w.store.getState().post(CHANNEL), null);
  assert.equal(w.calls.posts.length, 1, "no second call");
});

test("OB7-OB10: the draft names the admission refusals instead of a generic failure", () => {
  for (const code of ["ai_busy", "channel_busy", "may_train_target"]) {
    const markup = card({ triggerId: "t", status: "error", text: "", code });
    assert.doesNotMatch(markup, /The draft failed\. Try again\./, code);
  }
});
