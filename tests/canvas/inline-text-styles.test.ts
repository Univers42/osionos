/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inline-text-styles.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 16:52:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/29 16:55:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  INLINE_COLOR_OPTIONS,
  getInlineColorOption,
  hexToRgba,
  normalizeInlineColorToken,
} from "../../src/shared/ui/assets/inlineTextStyles.ts";

test("INLINE_COLOR_OPTIONS has defined color presets", () => {
  assert.ok(Array.isArray(INLINE_COLOR_OPTIONS));
  assert.ok(INLINE_COLOR_OPTIONS.length > 0);

  const first = INLINE_COLOR_OPTIONS[0];
  assert.ok(first);
  assert.ok(typeof first.id === "string");
  assert.ok(typeof first.textColor === "string");
  assert.ok(typeof first.backgroundColor === "string");
  assert.ok(first.backgroundColor.startsWith("rgba("));
});

test("getInlineColorOption resolves existing presets and custom hex", () => {
  const blueOption = getInlineColorOption("#2563eb");
  assert.ok(blueOption);
  assert.equal(blueOption.textColor, "#2563EB");
  assert.equal(blueOption.backgroundColor, "rgba(37, 99, 235, 0.18)");

  const shorthandOption = getInlineColorOption("#abc");
  assert.ok(shorthandOption);
  assert.equal(shorthandOption.textColor, "#AABBCC");

  const namedAlias = getInlineColorOption("blue");
  assert.ok(namedAlias);
  assert.equal(namedAlias.textColor, "#0EA5E9");
});

test("hexToRgba calculates valid rgba and falls back without hardcoded dark slate", () => {
  const validRgba = hexToRgba("#2563eb", 0.18);
  assert.equal(validRgba, "rgba(37, 99, 235, 0.18)");

  const fallback = hexToRgba("not-a-hex", 0.18);
  // Background should adapt to tokens rather than using the hardcoded dark slate literal (15, 23, 42)
  assert.ok(
    !fallback.includes("15, 23, 42"),
    "Background should not use hardcoded dark slate rgb(15, 23, 42)",
  );
  assert.ok(
    fallback.includes("var(--osio-bg-muted") ||
      fallback.includes("color-mix"),
    "Background should use token-driven fallback",
  );
});

test("getInlineColorOption returns undefined for empty or invalid input", () => {
  assert.equal(getInlineColorOption(""), undefined);
  assert.equal(getInlineColorOption("   "), undefined);
  assert.equal(getInlineColorOption("not-a-color-or-hex"), undefined);
});

test("normalizeInlineColorToken cleans up input correctly", () => {
  assert.equal(normalizeInlineColorToken("  #ff0000  "), "#FF0000");
  assert.equal(normalizeInlineColorToken("  blue  "), "#0EA5E9");
  assert.equal(normalizeInlineColorToken(""), null);
});
