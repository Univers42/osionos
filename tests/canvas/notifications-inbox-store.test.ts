/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notifications-inbox-store.test.ts                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #174: the inbox store could only be seeded and marked all-read; a notification could not
// be read on its own or deleted, and a live one held a made-up id the bridge never stored.

import assert from "node:assert/strict";
import test from "node:test";

import { liveNotificationItem, useNotificationsStore } from "../../src/store/chat/useNotificationsStore.ts";

const STORED = "11111111-1111-4111-8111-111111111111";
const item = (id: string, readAt: string | null = null) => ({
  id, type: "mention" as const, actorId: null, channelId: null, messageId: null, preview: id, readAt, createdAt: "2026-10-30T10:00:00.000Z",
});

function seed() {
  useNotificationsStore.getState().setItems([item("a"), item("b"), item("c", "2026-10-30T09:00:00.000Z")]);
  // The bridge's unread total counts rows beyond the 30 the list holds.
  useNotificationsStore.getState().setUnread(12);
}
const state = () => useNotificationsStore.getState();

test("markRead reads only the named notifications and counts down by the unread ones", () => {
  seed();
  state().markRead(["a", "c"]);
  assert.deepEqual(state().items.map((entry) => entry.readAt !== null), [true, false, true]);
  assert.equal(state().items[2].readAt, "2026-10-30T09:00:00.000Z", "an earlier read time is kept");
  assert.equal(state().unread, 11);
});

test("remove drops the named notifications and counts down by the unread ones it dropped", () => {
  seed();
  state().remove(["b", "c"]);
  assert.deepEqual(state().items.map((entry) => entry.id), ["a"]);
  assert.equal(state().unread, 11);
});

test("clear empties the list and the unread total", () => {
  seed();
  state().clear();
  assert.deepEqual(state().items, []);
  assert.equal(state().unread, 0);
});

test("the unread count never goes below zero", () => {
  seed();
  state().setUnread(1);
  state().remove(["a", "b"]);
  assert.equal(state().unread, 0);
});

test("a live notification keeps the id the bridge stored", () => {
  const live = liveNotificationItem({ id: STORED, type: "dm", channelId: "ch", preview: "hey" });
  assert.equal(live.id, STORED);
  assert.equal(live.type, "dm");
  assert.equal(live.channelId, "ch");
  assert.equal(live.preview, "hey");
  assert.equal(live.readAt, null);
});

test("a live notification from an older bridge, without an id, gets a local one", () => {
  const live = liveNotificationItem({ type: "mention" });
  assert.match(live.id, /^live-/);
  assert.equal(live.type, "mention");
});
