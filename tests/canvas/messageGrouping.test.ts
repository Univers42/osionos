/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   messageGrouping.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMessageRows, firstUnreadId } from "../../src/widgets/channel-messages/model/messageGrouping.ts";
import type { ChatMessage } from "../../src/shared/chat/messageApi.ts";

function msg(id: string, authorId: string, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, channelId: "c", authorId, authorName: authorId.toUpperCase(), content: "t", createdAt, reactions: [], ...extra } as ChatMessage;
}

describe("buildMessageRows", () => {
  it("groups a consecutive same-author message within 5 minutes", () => {
    const rows = buildMessageRows([
      msg("1", "a", "2026-06-26T10:00:00Z"),
      msg("2", "a", "2026-06-26T10:01:00Z"),
    ]);
    assert.notEqual(rows[0].divider, null); // the first row always opens a day
    assert.equal(rows[0].grouped, false);
    assert.equal(rows[1].divider, null);    // same day → no second divider
    assert.equal(rows[1].grouped, true);
  });

  it("does not group across a different author", () => {
    const rows = buildMessageRows([
      msg("1", "a", "2026-06-26T10:00:00Z"),
      msg("2", "b", "2026-06-26T10:01:00Z"),
    ]);
    assert.equal(rows[1].grouped, false);
  });

  it("does not group across a >5 minute gap", () => {
    const rows = buildMessageRows([
      msg("1", "a", "2026-06-26T10:00:00Z"),
      msg("2", "a", "2026-06-26T10:06:00Z"),
    ]);
    assert.equal(rows[1].grouped, false);
  });

  it("a reply always starts a fresh block", () => {
    const rows = buildMessageRows([
      msg("1", "a", "2026-06-26T10:00:00Z"),
      msg("2", "a", "2026-06-26T10:01:00Z", { replyTo: { id: "1", authorName: "A", content: "t" } }),
    ]);
    assert.equal(rows[1].grouped, false);
  });

  it("prints a divider when the day changes", () => {
    const rows = buildMessageRows([
      msg("1", "a", "2026-06-25T10:00:00Z"),
      msg("2", "a", "2026-06-26T10:00:00Z"),
    ]);
    assert.notEqual(rows[1].divider, null);
    assert.equal(rows[1].grouped, false);
  });

  it("returns an empty list for no messages", () => {
    assert.deepEqual(buildMessageRows([]), []);
  });
});

describe("firstUnreadId", () => {
  const list = [
    msg("1", "a", "2026-06-26T10:00:00Z"),
    msg("2", "me", "2026-06-26T10:05:00Z"),
    msg("3", "a", "2026-06-26T10:10:00Z"),
    msg("4", "a", "2026-06-26T10:15:00Z"),
  ];

  it("returns null when never read", () => {
    assert.equal(firstUnreadId(list, null, "me"), null);
  });

  it("anchors on the first message after lastReadAt not authored by self", () => {
    assert.equal(firstUnreadId(list, "2026-06-26T10:06:00Z", "me"), "3");
  });

  it("skips the reader's own messages", () => {
    // 10:04 is before msg 2 (self at 10:05) and msg 3 (a at 10:10) → anchor is 3, not 2.
    assert.equal(firstUnreadId(list, "2026-06-26T10:04:00Z", "me"), "3");
  });

  it("returns null when everything is already read", () => {
    assert.equal(firstUnreadId(list, "2026-06-26T11:00:00Z", "me"), null);
  });
});
