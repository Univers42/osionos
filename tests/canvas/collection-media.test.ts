/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collection-media.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createMediaCollectionPickerTab, resolveAssetValue } from "@univers42/ui-collection";

import { normalizeMediaSource, resolveCollectionMediaAsset } from "../../src/shared/ui/assets/collectionMedia.ts";

// The resolver before it dropped the picker tabs: a direct source, else whatever image preview
// ui-collection's resolveAssetValue found for the value in the cover tab.
const COVER_TAB = createMediaCollectionPickerTab("photos", [
  { id: "studio", label: "Studio", ref: "https://images.example/studio.jpg", previewUrl: "https://images.example/studio-720.jpg" },
  { id: "aurora", label: "Aurora", ref: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)" },
]);
function urlThroughTabs(value: string): string | undefined {
  if (/^(https?:|data:|blob:)/i.test(normalizeMediaSource(value) ?? value)) return normalizeMediaSource(value);
  const resolved = resolveAssetValue(value, [COVER_TAB]);
  return resolved?.preview?.kind === "image" ? resolved.preview.src : undefined;
}

const VALUES = [
  "https://images.example/studio.jpg", "http://plain.example/a.png", "url:https://images.example/x.png",
  "url:/assets/cover.png", "url:data:image/svg+xml,%3Csvg%3E", "data:image/png;base64,AAAA",
  "blob:http://localhost/0b7e", "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)", "photos:studio",
  "🚀", "emoji:🚀", "rocket", "icon:rocket", "url:", "URL:https://x.example/a.png",
];

test("every value gets the URL the picker tabs gave it", () => {
  for (const value of VALUES) {
    assert.equal(resolveCollectionMediaAsset(value, "Cover")?.url, urlThroughTabs(value), value);
  }
});

test("a resolved source carries the caller's label as label and thumbnail", () => {
  assert.deepEqual(resolveCollectionMediaAsset("url:/assets/cover.png", "Image"), {
    label: "Image", url: "/assets/cover.png", thumbnailUrl: "/assets/cover.png",
  });
});

test("no value or a value without a source resolves to null", () => {
  assert.equal(resolveCollectionMediaAsset(undefined), null);
  assert.equal(resolveCollectionMediaAsset(""), null);
  assert.equal(resolveCollectionMediaAsset("photos:studio"), null);
});

test("normalizeMediaSource strips only the url: prefix", () => {
  assert.equal(normalizeMediaSource("url:https://a.example/x"), "https://a.example/x");
  assert.equal(normalizeMediaSource("https://a.example/x"), "https://a.example/x");
  assert.equal(normalizeMediaSource(""), undefined);
  assert.equal(normalizeMediaSource(undefined), undefined);
});
