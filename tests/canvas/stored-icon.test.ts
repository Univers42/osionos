/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stored-icon.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import {
  type StoredIcon,
  isStoredIcon,
  parseStoredIcon,
  storedIconToCanonical,
  serializeStoredIcon,
} from "@osionos/ui";
import {
  storedIconSchema,
  lenientStoredIconSchema,
} from "@/shared/icon/storedIconSchema";

test("1. parseStoredIcon('🚀') parses bare emoji", () => {
  assert.deepEqual(parseStoredIcon("🚀"), { type: "emoji", value: "🚀" });
});

test("2. parseStoredIcon('🚀;bg=%23123456') parses emoji with background chip", () => {
  assert.deepEqual(parseStoredIcon("🚀;bg=%23123456"), {
    type: "emoji",
    value: "🚀",
    bg: "#123456",
  });
});

test("3. parseStoredIcon('icon:rocket') parses lucide icon ref", () => {
  assert.deepEqual(parseStoredIcon("icon:rocket"), {
    type: "icon",
    name: "rocket",
  });
});

test("4. parseStoredIcon('icon:rocket;color=%23ff0000') parses icon with stroke color", () => {
  assert.deepEqual(parseStoredIcon("icon:rocket;color=%23ff0000"), {
    type: "icon",
    name: "rocket",
    color: "#ff0000",
  });
});

test("5. parseStoredIcon('img:https://example.com/logo.svg') parses custom image/svg URL", () => {
  assert.deepEqual(parseStoredIcon("img:https://example.com/logo.svg"), {
    type: "image",
    url: "https://example.com/logo.svg",
  });
});

test("6. parseStoredIcon('url:https://example.com/pic.png') parses legacy url: prefix", () => {
  assert.deepEqual(parseStoredIcon("url:https://example.com/pic.png"), {
    type: "image",
    url: "https://example.com/pic.png",
  });
});

test("7. parseStoredIcon({ type: 'emoji', value: '🚀' }) returns canonical object", () => {
  const icon: StoredIcon = { type: "emoji", value: "🚀" };
  assert.deepEqual(parseStoredIcon(icon), { type: "emoji", value: "🚀" });
  assert.deepEqual(storedIconToCanonical(icon), { type: "emoji", value: "🚀" });
});

test("8. parseStoredIcon({ type: 'icon', name: 'shield', color: 'blue' }) returns canonical object", () => {
  const icon: StoredIcon = { type: "icon", name: "shield", color: "blue" };
  assert.deepEqual(parseStoredIcon(icon), {
    type: "icon",
    name: "shield",
    color: "blue",
  });
  assert.deepEqual(storedIconToCanonical(icon), {
    type: "icon",
    name: "shield",
    color: "blue",
  });
});

test("9. parseStoredIcon({ type: 'image', url: 'https://foo.bar/img.png' }) returns canonical object", () => {
  const icon: StoredIcon = { type: "image", url: "https://foo.bar/img.png" };
  assert.deepEqual(parseStoredIcon(icon), {
    type: "image",
    url: "https://foo.bar/img.png",
  });
  assert.deepEqual(storedIconToCanonical(icon), {
    type: "image",
    url: "https://foo.bar/img.png",
  });
});

test("10. parseStoredIcon returns null for empty, null, undefined, or empty object", () => {
  assert.equal(parseStoredIcon(""), null);
  assert.equal(parseStoredIcon("   "), null);
  assert.equal(parseStoredIcon(null), null);
  assert.equal(parseStoredIcon(undefined), null);
  assert.equal(parseStoredIcon({}), null);
});

test("isStoredIcon type guard identifies StoredIcon shapes correctly", () => {
  assert.equal(isStoredIcon({ type: "emoji", value: "🚀" }), true);
  assert.equal(isStoredIcon({ type: "icon", name: "rocket" }), true);
  assert.equal(isStoredIcon({ type: "image", url: "https://example.com/pic.png" }), true);
  assert.equal(isStoredIcon("🚀"), false);
  assert.equal(isStoredIcon(null), false);
  assert.equal(isStoredIcon(undefined), false);
  assert.equal(isStoredIcon({}), false);
  assert.equal(isStoredIcon({ type: "unknown" }), false);
  assert.equal(isStoredIcon({ type: "emoji" }), false);
  assert.equal(isStoredIcon({ type: "emoji", value: "" }), false);
});

test("11. serializeStoredIcon round-trips correctly for all 3 kinds", () => {
  const emojiIcon: StoredIcon = { type: "emoji", value: "🚀", bg: "#123456" };
  assert.deepEqual(parseStoredIcon(serializeStoredIcon(emojiIcon)), emojiIcon);

  const iconIcon: StoredIcon = { type: "icon", name: "rocket", color: "#ff0000" };
  assert.deepEqual(parseStoredIcon(serializeStoredIcon(iconIcon)), iconIcon);

  const imageIcon: StoredIcon = {
    type: "image",
    url: "https://example.com/logo.svg",
    color: "#00ff00",
  };
  assert.deepEqual(parseStoredIcon(serializeStoredIcon(imageIcon)), imageIcon);
});

test("12. storedIconSchema.safeParse passes for valid StoredIcon objects", () => {
  assert.ok(storedIconSchema.safeParse({ type: "emoji", value: "🚀" }).success);
  assert.ok(storedIconSchema.safeParse({ type: "emoji", value: "🚀", bg: "#fff" }).success);
  assert.ok(storedIconSchema.safeParse({ type: "icon", name: "rocket" }).success);
  assert.ok(storedIconSchema.safeParse({ type: "icon", name: "rocket", color: "#000" }).success);
  assert.ok(storedIconSchema.safeParse({ type: "image", url: "https://example.com/i.png" }).success);
  assert.ok(
    storedIconSchema.safeParse({
      type: "image",
      url: "https://example.com/i.png",
      color: "#000",
    }).success,
  );
});

test("13. storedIconSchema.safeParse fails for invalid shapes", () => {
  assert.equal(storedIconSchema.safeParse({ type: "unknown" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "emoji" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "emoji", value: "" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "icon" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "icon", name: "" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "image" }).success, false);
  assert.equal(storedIconSchema.safeParse({ type: "image", url: "" }).success, false);
  assert.equal(storedIconSchema.safeParse(null).success, false);
  assert.equal(storedIconSchema.safeParse("🚀").success, false);
});

test("14. lenientStoredIconSchema.safeParse accepts legacy strings and produces validated StoredIcon", () => {
  const r1 = lenientStoredIconSchema.safeParse("🚀");
  assert.ok(r1.success);
  assert.deepEqual(r1.data, { type: "emoji", value: "🚀" });

  const r2 = lenientStoredIconSchema.safeParse("icon:rocket");
  assert.ok(r2.success);
  assert.deepEqual(r2.data, { type: "icon", name: "rocket" });

  const r3 = lenientStoredIconSchema.safeParse("img:https://example.com/icon.png");
  assert.ok(r3.success);
  assert.deepEqual(r3.data, { type: "image", url: "https://example.com/icon.png" });

  const r4 = lenientStoredIconSchema.safeParse({ type: "emoji", value: "🎉" });
  assert.ok(r4.success);
  assert.deepEqual(r4.data, { type: "emoji", value: "🎉" });

  const r5 = lenientStoredIconSchema.safeParse(null);
  assert.ok(r5.success);
  assert.equal(r5.data, null);

  const r6 = lenientStoredIconSchema.safeParse("");
  assert.ok(r6.success);
  assert.equal(r6.data, null);
});
