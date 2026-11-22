/**
 * A posted AI answer in the channel (osio-bot OB4, OB6). OB4: the row makes
 * no zero-click request: no link card, favicon, player or inline image, so an
 * answer steered into naming an attacker's URL cannot make every reader's
 * browser fetch it. The same text in a person's row is the positive control:
 * it does render an <img>, so the detector can see one. OB6: the bot badge
 * says who asked; the asker or a channel admin may delete; anyone may report.
 *
 * Caveat: the check reads the server-rendered markup (no effects run), so a
 * request a component would make from an effect is seen only as the element
 * that would make it; the Playwright request log is not part of this run.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatMessage } from "@/shared/chat/messageApi";
import { MessageRow } from "@/widgets/channel-messages/ui/MessageRow";

const ME = "u0000000-0000-4000-8000-000000000001";
const ANA = "u0000000-0000-4000-8000-000000000002";
const LINK = "https://a.attacker.example/x";
const IMAGE = "![x](https://a.attacker.example/i.png)";
const noop = () => undefined;

function message(content: string, ai: boolean, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    channelId: "c1",
    authorId: ai ? "" : ANA,
    authorName: ai ? "AI" : "Ana",
    content,
    createdAt: "2026-11-22T10:00:00.000Z",
    reactions: [],
    attachments: [],
    ...(ai ? { isAi: true, aiRequestedBy: ANA } : {}),
    ...extra,
  } as ChatMessage;
}

function row(one: ChatMessage, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(MessageRow, {
      message: one,
      isAuthor: false,
      canInteract: true,
      userId: ME,
      onEdit: () => ({ ok: true }) as never,
      onDelete: noop,
      onReact: noop,
      onReply: noop,
      ...props,
    }),
  );
}

/** Every element that fetches by itself when it reaches the DOM. */
const LOADS = /<(img|iframe|video|audio|source|object|embed|link)\b|\ssrc(set)?="/i;

test("OB4: an AI row naming a link renders no card, favicon or player, and keeps the URL as text", () => {
  const ai = row(message(`see ${LINK}`, true, { attachments: [{ type: "url", url: LINK }] }));
  assert.doesNotMatch(ai, LOADS);
  assert.match(ai, /a\.attacker\.example\/x/);
  assert.match(row(message(`see ${LINK}`, false)), LOADS, "control: a person's row shows the card");
});

test("OB4: an AI row with a markdown image renders no <img>", () => {
  const ai = row(message(`look ${IMAGE}`, true));
  assert.doesNotMatch(ai, LOADS);
  assert.match(row(message(`look ${IMAGE}`, false)), /<img[^>]*a\.attacker\.example\/i\.png/, "control: a person's row inlines it");
});

test("OB6: the bot badge says who asked: you, a named member, or a member", () => {
  assert.match(row(message("Friday.", true, { aiRequestedBy: ME })), /AI answer, asked by you/);
  assert.match(row(message("Friday.", true), { askerName: "Ana" }), /AI answer, asked by Ana/);
  assert.match(row(message("Friday.", true)), /AI answer, asked by a member/);
});

test("OB6: an AI row can be reported; a person's row is not changed", () => {
  assert.match(row(message("Friday.", true), { onReport: noop }), /aria-label="Report AI answer"/);
  assert.doesNotMatch(row(message("Friday.", false), { onReport: noop }), /Report AI answer/);
});

test("OB6: the asker or a channel admin may delete an AI answer; another member may not", async () => {
  const rules = (await import("@/widgets/channel-messages/model/aiAnswerRow")) as {
    canDeleteMessage?: (one: ChatMessage, userId: string, canModerate: boolean) => boolean;
  };
  const canDelete = rules.canDeleteMessage as NonNullable<typeof rules.canDeleteMessage>;
  assert.equal(typeof canDelete, "function");
  const answer = message("Friday.", true);
  assert.deepEqual([canDelete(answer, ANA, false), canDelete(answer, ME, true), canDelete(answer, ME, false)], [true, true, false]);
  const own = message("hi", false);
  assert.deepEqual([canDelete(own, ANA, false), canDelete(own, ME, true)], [true, false], "a person's row: its author only, as before");
});

test("OB6: a report names the message, and no person as its subject (C439)", async () => {
  const rules = (await import("@/widgets/channel-messages/model/aiAnswerRow")) as {
    aiAnswerReport?: (messageId: string) => Record<string, unknown>;
  };
  assert.deepEqual(rules.aiAnswerReport?.("m1"), { subjectKind: "message", subjectId: "m1", category: "ai_answer" });
});

test("OB4: an AI answer that reaches the open thread live keeps isAi, so it renders as plain text", async () => {
  const thread = (await import("@/widgets/channel-messages/model/useThread")) as {
    applyThreadFrame?: (messages: ChatMessage[], frame: unknown, rootId: string, channelId: string) => ChatMessage[];
  };
  const apply = thread.applyThreadFrame as NonNullable<typeof thread.applyThreadFrame>;
  assert.equal(typeof apply, "function");
  const payload = {
    messageId: "m2", channelId: "c1", threadRootId: "m1", authorId: "", authorName: "AI",
    content: `see ${LINK} ${IMAGE}`, attachments: [{ type: "url", url: LINK }], isAi: true, aiRequestedBy: { id: ANA },
  };
  const [answer] = apply([], { event_type: "message_created", payload }, "m1", "c1");
  assert.deepEqual([answer?.isAi, answer?.aiRequestedBy], [true, ANA]);
  assert.doesNotMatch(row(answer), LOADS);
  const [person] = apply([], { event_type: "message_created", payload: { ...payload, isAi: false } }, "m1", "c1");
  assert.match(row(person), LOADS, "control: the same frame from a person shows the card and the image");
});
