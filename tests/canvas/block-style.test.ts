/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   block-style.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "sass-embedded";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { STYLE_SCALES, sanitizeBlockStyle, resolveBlockStyle } from "../../src/entities/block/model/blockStyle.ts";

const SCSS_PATH = path.resolve(fileURLToPath(new URL("../../src/app/styles/block-style.scss", import.meta.url)));

test("sanitize drops unknown keys and invalid values", () => {
  assert.deepEqual(sanitizeBlockStyle({ padding: 3, radius: "panel", bogus: 1, gap: 99, tone: "neon" }), { padding: 3, radius: "panel" });
});

test("sanitize returns {} for non-objects", () => {
  assert.deepEqual(sanitizeBlockStyle(null), {});
  assert.deepEqual(sanitizeBlockStyle("x"), {});
  assert.deepEqual(sanitizeBlockStyle([]), {});
});

test("resolve emits data-s-<key> attributes", () => {
  assert.deepEqual(resolveBlockStyle({ style: { padding: 3 } }), { "data-s-padding": "3" });
});

test("style wins over flat fields", () => {
  assert.equal(resolveBlockStyle({ style: { text: "blue" }, textColor: "red" })["data-s-text"], "blue");
  assert.equal(resolveBlockStyle({ textColor: "red" })["data-s-text"], "red");
});

test("resolve is memoised by style identity", () => {
  const s = { gap: 2 };
  assert.equal(resolveBlockStyle({ style: s }), resolveBlockStyle({ style: s }));
});

test("scss contains a selector for every scale value", () => {
  const result = compile(SCSS_PATH);
  const css = result.css;
  for (const [key, values] of Object.entries(STYLE_SCALES)) {
    for (const value of values as readonly (string | number)[]) {
      assert.ok(css.includes(`[data-s-${key}="${value}"]`), `missing selector [data-s-${key}="${value}"]`);
    }
  }
});