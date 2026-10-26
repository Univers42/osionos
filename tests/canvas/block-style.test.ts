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

import {
  COMPONENT_DEFINED_PROPS,
  PROP_SCALE,
  STYLE_SCALES,
  sanitizeBlockStyle,
  resolveBlockStyle,
} from "../../src/entities/block/model/blockStyle.ts";

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
  assert.equal(resolveBlockStyle({ style: { text: "blue" }, textColor: "var(--osio-block-tint-red-fg)" })["data-s-text"], "blue");
  assert.equal(resolveBlockStyle({ textColor: "var(--osio-block-tint-red-fg)" })["data-s-text"], "red");
  assert.equal(resolveBlockStyle({ textColor: "#ff0000" })["data-s-text"], undefined);
});

test("resolve is memoised by style identity", () => {
  const s = { gap: 2 };
  assert.equal(resolveBlockStyle({ style: s }), resolveBlockStyle({ style: s }));
});

test("resolve caches per flat colour", () => {
  const style = {} as { gap?: number };
  const r1 = resolveBlockStyle({ style, textColor: "var(--osio-block-tint-red-fg)" });
  const r2 = resolveBlockStyle({ style, textColor: "var(--osio-block-tint-blue-fg)" });
  assert.equal(r1["data-s-text"], "red");
  assert.equal(r2["data-s-text"], "blue");
  const r1b = resolveBlockStyle({ style, textColor: "var(--osio-block-tint-red-fg)" });
  assert.equal(r1b, r1);
});

test("same inputs return the same object", () => {
  const a = resolveBlockStyle({ textColor: "var(--osio-block-tint-red-fg)" });
  const b = resolveBlockStyle({ textColor: "var(--osio-block-tint-red-fg)" });
  assert.equal(a, b);
  const s = { gap: 2 };
  const c = resolveBlockStyle({ style: s });
  const d = resolveBlockStyle({ style: s });
  assert.equal(c, d);
});

test("scss has a non-empty rule for every prop value", () => {
  const result = compile(SCSS_PATH);
  const css = result.css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const prop of Object.keys(PROP_SCALE)) {
    if ((COMPONENT_DEFINED_PROPS as readonly string[]).includes(prop)) {
      assert.ok(!css.includes(`[data-s-${prop}=`), `${prop} must have no rule`);
      continue;
    }
    const scaleKey = PROP_SCALE[prop];
    const scale = STYLE_SCALES[scaleKey as keyof typeof STYLE_SCALES] as readonly (string | number)[];
    for (const value of scale) {
      const re = new RegExp(`\\[data-s-${prop}="?${value}"?\\]\\s*\\{([^}]*)\\}`);
      const m = css.match(re);
      assert.ok(m, `missing selector [data-s-${prop}=${value}]`);
      assert.ok(m[1].trim().length > 0, `empty block for [data-s-${prop}=${value}]`);
    }
  }
});

test("border none is zero and top has three zeros", () => {
  const css = compile(SCSS_PATH).css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\[data-s-border="?none"?\]\s*\{[^}]*border:\s*0/);
  assert.match(css, /\[data-s-border\]\[data-s-borderSides="?top"?\][^{]*\{[^}]*border-width:\s*var\(--osio-border-width,\s*1px\)\s+0\s+0\s+0/);
});

test("text danger uses --osio-danger and surface danger uses color-mix", () => {
  const css = compile(SCSS_PATH).css;
  assert.match(css, /\[data-s-text="?danger"?\][^{]*\{[^}]*color:\s*var\(--osio-danger\)/);
  assert.match(css, /\[data-s-surface="?danger"?\][^{]*\{[^}]*color-mix\(in srgb, var\(--osio-danger\) 10%, transparent\)/);
});

test("width rules", () => {
  const css = compile(SCSS_PATH).css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\[data-s-width="?fill"?\][^{]*\{[^}]*width:\s*100%/);
  assert.match(css, /\[data-s-width="?fill"?\][^{]*\{[^}]*min-width:\s*0/);
  assert.match(css, /\[data-s-width="?fill"?\][^{]*\{[^}]*flex:\s*1 1 0%/);
  assert.match(css, /\[data-s-width="?hug"?\][^{]*\{[^}]*width:\s*fit-content/);
  assert.match(css, /\[data-s-width="?hug"?\][^{]*\{[^}]*max-width:\s*100%/);
  assert.match(css, /\[data-s-width="?fixed"?\][^{]*\{[^}]*flex-shrink:\s*0/);
});