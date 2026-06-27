/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   icon-value.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { parseIconValue, serializeIconValue } from "../../src/shared/lib/iconValue/iconValue.ts";

test("bare emoji parses as an emoji", () => {
  const v = parseIconValue("🚀");
  assert.equal(v?.kind, "emoji");
  assert.equal(v?.ref, "🚀");
});
test("empty / undefined → null", () => {
  assert.equal(parseIconValue(undefined), null);
  assert.equal(parseIconValue(""), null);
  assert.equal(parseIconValue("   "), null);
});
test("icon: form parses to a lucide ref", () => {
  const v = parseIconValue("icon:rocket");
  assert.equal(v?.kind, "icon");
  assert.equal(v?.ref, "rocket");
  assert.equal(v?.color, undefined);
});
test("legacy url: and new img: both parse as image", () => {
  assert.equal(parseIconValue("img:data:image/svg+xml,%3Csvg/%3E")?.kind, "image");
  assert.equal(parseIconValue("url:https://x.dev/a.png")?.kind, "image");
});
test("icon color is decoded from the ;color= suffix", () => {
  const v = parseIconValue("icon:rocket;color=%23ef4444");
  assert.equal(v?.kind, "icon");
  assert.equal(v?.ref, "rocket");
  assert.equal(v?.color, "#ef4444");
});
test("emoji background is decoded from the ;bg= suffix", () => {
  const v = parseIconValue("🚀;bg=%23fee2e2");
  assert.equal(v?.kind, "emoji");
  assert.equal(v?.ref, "🚀");
  assert.equal(v?.bg, "#fee2e2");
});
test("serialize encodes the color (no raw # to clash with ] in callout markdown)", () => {
  const out = serializeIconValue({ kind: "icon", ref: "rocket", color: "#ef4444" });
  assert.equal(out, "icon:rocket;color=%23ef4444");
  assert.ok(!out.includes("#"));
});
test("serialize → parse round-trips an icon with color", () => {
  const v = parseIconValue(serializeIconValue({ kind: "icon", ref: "star", color: "#22c55e" }));
  assert.equal(v?.ref, "star");
  assert.equal(v?.color, "#22c55e");
});
test("serialize → parse round-trips an emoji with bg", () => {
  const v = parseIconValue(serializeIconValue({ kind: "emoji", ref: "💡", bg: "#fef9c3" }));
  assert.equal(v?.ref, "💡");
  assert.equal(v?.bg, "#fef9c3");
});
test("image serializes with the img: prefix", () => {
  assert.equal(serializeIconValue({ kind: "image", ref: "data:image/svg+xml,%3Csvg/%3E" }), "img:data:image/svg+xml,%3Csvg/%3E");
});
test("an svg data-uri with its own ';' is not mistaken for a color", () => {
  const v = parseIconValue("img:data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
  assert.equal(v?.kind, "image");
  assert.equal(v?.ref, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
  assert.equal(v?.color, undefined);
});
test("a bare emoji has no color/bg", () => {
  const v = parseIconValue("⭐");
  assert.equal(v?.bg, undefined);
  assert.equal(v?.color, undefined);
});
