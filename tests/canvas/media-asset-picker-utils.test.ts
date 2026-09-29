/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   media-asset-picker-utils.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 18:03:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 18:03:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSearchStatusAria,
  normalizeSearchQuery,
  resolveFallbackNotice,
  shouldFetchUnsplash,
} from "../../src/shared/ui/molecules/MediaAssetPicker/mediaAssetPickerUtils.ts";

test("normalizeSearchQuery trims whitespace and collapses consecutive spaces", () => {
  assert.equal(normalizeSearchQuery("  nature   mountains  "), "nature mountains");
  assert.equal(normalizeSearchQuery(""), "");
  assert.equal(normalizeSearchQuery("    "), "");
  assert.equal(normalizeSearchQuery("\tcoding \n  workspace\t"), "coding workspace");
});

test("shouldFetchUnsplash requires image kind and sufficient normalized length", () => {
  assert.equal(shouldFetchUnsplash("image", "nature"), true);
  assert.equal(shouldFetchUnsplash("image", "hi"), true);
  assert.equal(shouldFetchUnsplash("image", "a"), false);
  assert.equal(shouldFetchUnsplash("image", "   "), false);
  assert.equal(shouldFetchUnsplash("video", "nature"), false);
  assert.equal(shouldFetchUnsplash("audio", "nature"), false);
});

test("resolveFallbackNotice shows notice only when loaded with empty results", () => {
  assert.equal(
    resolveFallbackNotice(true, 0),
    "Showing local fallbacks until the bridge has an Unsplash key.",
  );
  assert.equal(resolveFallbackNotice(false, 0), null);
  assert.equal(resolveFallbackNotice(true, 5), null);
  assert.equal(resolveFallbackNotice(false, 5), null);
});

test("formatSearchStatusAria produces accurate polite screen reader announcements", () => {
  assert.equal(formatSearchStatusAria(true, 0, false), "Searching images...");
  assert.equal(formatSearchStatusAria(true, 10, true), "Searching images...");
  assert.equal(formatSearchStatusAria(false, 12, true), "Found 12 images");
  assert.equal(formatSearchStatusAria(false, 1, true), "Found 1 image");
  assert.equal(
    formatSearchStatusAria(false, 0, true),
    "No Unsplash images found. Displaying fallback suggestions.",
  );
  assert.equal(formatSearchStatusAria(false, 0, false), "");
});
