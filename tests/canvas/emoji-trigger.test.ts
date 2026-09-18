/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emoji-trigger.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEmojiInsert, matchEmojiTrigger } from "../../src/shared/lib/emoji/emojiTrigger";

test("a BARE colon triggers with an empty filter", () => {
  assert.deepEqual(matchEmojiTrigger(":"), { filter: "", colonIndex: 0 });
  assert.deepEqual(matchEmojiTrigger("hello :"), { filter: "", colonIndex: 6 });
});

test("colon at the very START of a block triggers", () => {
  const match = matchEmojiTrigger(":sm");
  assert.equal(match?.filter, "sm");
  assert.equal(match?.colonIndex, 0);
});

test("the filter grows as the user types", () => {
  assert.equal(matchEmojiTrigger(":s")?.filter, "s");
  assert.equal(matchEmojiTrigger(":smi")?.filter, "smi");
  assert.equal(matchEmojiTrigger("a :heart_eyes")?.filter, "heart_eyes");
  assert.equal(matchEmojiTrigger(":+1")?.filter, "+1");
});

test("opening brackets count as a boundary", () => {
  assert.equal(matchEmojiTrigger("(:")?.filter, "");
  assert.equal(matchEmojiTrigger("[:fire")?.filter, "fire");
  assert.equal(matchEmojiTrigger("{:x")?.filter, "x");
});

test("urls, times and mid-word colons never trigger", () => {
  assert.equal(matchEmojiTrigger("https://"), null);
  assert.equal(matchEmojiTrigger("http://example.com"), null);
  assert.equal(matchEmojiTrigger("10:30"), null);
  assert.equal(matchEmojiTrigger("Note:x"), null);
  assert.equal(matchEmojiTrigger("ratio 3:4"), null);
});

test("no trailing trigger means no match", () => {
  assert.equal(matchEmojiTrigger(""), null);
  assert.equal(matchEmojiTrigger("plain text"), null);
  assert.equal(matchEmojiTrigger(":smile done"), null);
});

test("insert replaces the pending trigger", () => {
  assert.equal(applyEmojiInsert("hello :sm", "😄"), "hello 😄");
  assert.equal(applyEmojiInsert(":", "😄"), "😄");
  assert.equal(applyEmojiInsert(":fire", "🔥"), "🔥");
});

test("insert APPENDS when there is no trigger (opened via /emoji)", () => {
  assert.equal(applyEmojiInsert("hello", "😄"), "hello😄");
  assert.equal(applyEmojiInsert("", "😄"), "😄");
  // A url in the text must not be mistaken for a trigger and truncated.
  assert.equal(applyEmojiInsert("see http://a.b", "😄"), "see http://a.b😄");
});
