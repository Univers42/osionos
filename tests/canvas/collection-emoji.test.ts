/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collection-emoji.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EMOJI_PICKER_ITEMS } from "@univers42/ui-collection";

import {
  COLLECTION_ROLE_BADGES,
  getCollectionEmojiValue,
  randomUiCollectionEmoji,
  type CollectionEmojiId,
} from "../../src/shared/ui/assets/collectionEmoji.ts";

// The ui-collection id each preset was read from before the glyphs became literals; `null` where
// the library never had it and the literal was already the only source.
const LIBRARY_ID: Record<CollectionEmojiId, string | null> = {
  wave: "waving-hand", "thumbs-up": "thumbs-up", fire: "fire", sparkles: "sparkles", rocket: "rocket",
  party: "party-face", check: "check-mark-button", warning: "warning", idea: "light-bulb", brain: null,
  palette: "artist-palette", package: "package", pin: "pushpin", paperclip: "paperclip",
  puzzle: "puzzle-piece", tools: "toolbox", megaphone: null, heart: "red-heart", star: "star",
  moon: "moon", sun: "sun", leaf: "herb", robot: null, cool: null,
};

test("every preset is the same glyph ui-collection's emoji list gives for it", () => {
  const library = new Map(DEFAULT_EMOJI_PICKER_ITEMS.map((item) => [item.id, item.value]));
  for (const [id, libraryId] of Object.entries(LIBRARY_ID) as [CollectionEmojiId, string | null][]) {
    const glyph = getCollectionEmojiValue(id);
    assert.ok(glyph.length > 0, id);
    const fromLibrary = libraryId === null ? undefined : library.get(libraryId);
    if (fromLibrary !== undefined) assert.equal(glyph, fromLibrary, id);
  }
});

test("a random page emoji is one of the default page presets", () => {
  const presets = (["rocket", "idea", "package", "pin", "sparkles", "star", "palette", "tools"] as const)
    .map(getCollectionEmojiValue);
  for (let draw = 0; draw < 64; draw += 1) assert.ok(presets.includes(randomUiCollectionEmoji()));
});

test("role badges use the star, palette and cool presets", () => {
  assert.deepEqual(COLLECTION_ROLE_BADGES, {
    admin: getCollectionEmojiValue("star"),
    collaborator: getCollectionEmojiValue("palette"),
    member: getCollectionEmojiValue("palette"),
    guest: getCollectionEmojiValue("cool"),
  });
});
