/**
 * The thread view's rows follow the timeline's rules for a posted AI answer
 * (osio-bot OB6): the asker or a channel admin may delete it, and anyone may
 * report it. The thread used to grant delete to the row's author only, and an
 * AI row has no person as its author.
 *
 * Caveat: the panel is rendered on the server, so useThread's fetch and live
 * subscription never run: the list is the root it falls back to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChatMessage } from "@/shared/chat/messageApi";
import { ThreadPanel } from "@/widgets/channel-messages/ui/ThreadPanel";

const ME = "u0000000-0000-4000-8000-000000000001";
const ANA = "u0000000-0000-4000-8000-000000000002";
const noop = () => undefined;

function answer(askedBy: string): ChatMessage {
  return {
    id: "m1", channelId: "c1", authorId: "", authorName: "AI", content: "Friday.",
    createdAt: "2026-11-22T10:00:00.000Z", reactions: [], attachments: [], isAi: true, aiRequestedBy: askedBy,
  } as ChatMessage;
}

function panel(root: ChatMessage, props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    React.createElement(ThreadPanel as unknown as React.FC<Record<string, unknown>>, {
      root, channelId: "c1", workspaceId: "", userId: ME, canInteract: true,
      onReply: noop, onEdit: () => ({ ok: true }), onDelete: noop, onReact: noop, onSend: noop, onClose: noop,
      ...props,
    }),
  );
}

const DELETE = /aria-label="Delete message"/;

test("OB6: in the thread, the asker may delete the AI answer they asked for", () => {
  assert.match(panel(answer(ME), { canModerate: false }), DELETE);
});

test("OB6: in the thread, a channel admin may delete an AI answer; another member may not", () => {
  assert.match(panel(answer(ANA), { canModerate: true }), DELETE);
  assert.doesNotMatch(panel(answer(ANA), { canModerate: false }), DELETE);
});

test("OB6: in the thread, an AI answer can be reported", () => {
  assert.match(panel(answer(ANA), { canModerate: false, onReport: noop }), /aria-label="Report AI answer"/);
});

test("OB6: in the thread, an AI answer names the member who asked for it", () => {
  assert.match(panel(answer(ANA), { authorNames: { [ANA]: "Ana" } }), /AI answer, asked by Ana/);
});
