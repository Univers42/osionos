/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chat-catch-up.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #172: after the live connection comes back, a channel re-reads its history. What the
// server sends is the truth for every message it knows; a message still being sent
// from this tab is not on the server yet and must not vanish.

import assert from "node:assert/strict";
import test from "node:test";

import { catchUpHistory, PENDING_MESSAGE_PREFIX } from "../../src/widgets/channel-messages/model/historyCatchUp.ts";
import type { ChatMessage } from "../../src/shared/chat/messageApi.ts";

const message = (id: string, content = id): ChatMessage => ({
  id, channelId: "chan", authorId: "u1", authorName: "Ada", content, createdAt: "2026-10-30T10:00:00.000Z", reactions: [],
});

test("messages sent during the gap appear, in the server's order", () => {
  const current = [message("m1"), message("m2")];
  const fetched = [message("m1"), message("m2"), message("m3"), message("m4")];
  assert.deepEqual(catchUpHistory(fetched, current).map((m) => m.id), ["m1", "m2", "m3", "m4"]);
});

test("an edit or a delete made during the gap is taken from the server", () => {
  const current = [message("m1", "before"), message("m2")];
  const fetched = [message("m1", "after")];
  const merged = catchUpHistory(fetched, current);
  assert.deepEqual(merged.map((m) => [m.id, m.content]), [["m1", "after"]]);
});

test("messages older than the page the server sent back stay: the view has no way to load them again", () => {
  const at = (minute: number) => `2026-10-30T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const timed = (id: string, minute: number) => ({ ...message(id), createdAt: at(minute) });
  const current = [timed("m1", 1), timed("m2", 2), timed("m3", 3)];
  const fetched = [timed("m2", 2), timed("m3", 3), timed("m4", 4)];
  assert.deepEqual(catchUpHistory(fetched, current).map((m) => m.id), ["m1", "m2", "m3", "m4"]);
});

test("a message still being sent from this tab stays, after the server's", () => {
  const sending = message(`${PENDING_MESSAGE_PREFIX}1-abc`, "on its way");
  const merged = catchUpHistory([message("m1"), message("m2")], [message("m1"), sending]);
  assert.deepEqual(merged.map((m) => m.id), ["m1", "m2", sending.id]);
});
